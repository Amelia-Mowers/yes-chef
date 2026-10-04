// Sheffield's edit vocabulary. Every proposal (from the rule-based importer today,
// from a local model later) is a list of small ops that refer to things by NAME.
// Code resolves names, owns ids and colours, and validates the result, so a
// proposer can never produce a broken menu.

export const PALETTE = ['#E07A5F', '#F2CC8F', '#81B29A', '#3D85C6', '#9C89B8', '#F28482', '#84A59D', '#E9C46A', '#6D6875', '#2A9D8F']

const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ')
const key = s => norm(s).toLowerCase()
const slug = s => key(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'x'

function uniqueId(prefix, name, taken) {
  const base = `${prefix}_${slug(name)}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`
  taken.add(id)
  return id
}

function allIds(menu) {
  const ids = new Set()
  for (const c of menu.categories) {
    ids.add(c.id)
    for (const i of c.items) ids.add(i.id)
  }
  for (const g of menu.modifierGroups) {
    ids.add(g.id)
    for (const o of g.options) ids.add(o.id)
  }
  return ids
}

export const findCategory = (menu, name) => menu.categories.find(c => key(c.name) === key(name))
export const findGroup = (menu, name) => menu.modifierGroups.find(g => key(g.name) === key(name))

// Items can be addressed as "Item" or "Category / Item".
export function findItem(menu, ref) {
  const [maybeCat, maybeItem] = String(ref).includes('/') ? String(ref).split('/').map(norm) : [null, norm(ref)]
  for (const c of menu.categories) {
    if (maybeCat && key(c.name) !== key(maybeCat)) continue
    const item = c.items.find(i => key(i.name) === key(maybeItem))
    if (item) return {category: c, item}
  }
  return null
}

function nextColor(menu) {
  const used = new Set(menu.categories.map(c => c.color))
  return PALETTE.find(c => !used.has(c)) || PALETTE[menu.categories.length % PALETTE.length]
}

// Applies ops to a copy of `menu`. Never throws: invalid ops are skipped and reported.
export function applyOps(menu, ops) {
  const next = structuredClone(menu || {version: 0, categories: [], modifierGroups: []})
  const ids = allIds(next)
  const errors = []
  const applied = []

  const ensureCategory = (name, color) => {
    let c = findCategory(next, name)
    if (!c) {
      c = {id: uniqueId('cat', name, ids), name: norm(name), color: color || nextColor(next), items: []}
      next.categories.push(c)
    }
    return c
  }
  const ensureGroup = spec => {
    let g = findGroup(next, spec.name)
    if (!g) {
      g = {id: uniqueId('mg', spec.name, ids), name: norm(spec.name), select: spec.select === 'multi' ? 'multi' : 'single', required: Boolean(spec.required), options: []}
      next.modifierGroups.push(g)
    }
    for (const o of spec.options || []) addOption(g, o)
    return g
  }
  const addOption = (g, name) => {
    if (!norm(name) || g.options.some(o => key(o.name) === key(name))) return
    g.options.push({id: uniqueId('opt', name, ids), name: norm(name)})
  }

  for (const op of ops || []) {
    const fail = msg => errors.push({op, error: msg})
    try {
      switch (op.op) {
        case 'addCategory':
          if (!norm(op.name)) fail('Category needs a name')
          else ensureCategory(op.name, op.color)
          break
        case 'renameCategory': {
          const c = findCategory(next, op.category)
          if (!c) fail(`No category called “${op.category}”`)
          else if (!norm(op.name)) fail('New name is empty')
          else c.name = norm(op.name)
          break
        }
        case 'removeCategory': {
          const i = next.categories.findIndex(c => key(c.name) === key(op.category))
          if (i < 0) fail(`No category called “${op.category}”`)
          else next.categories.splice(i, 1)
          break
        }
        case 'addItem': {
          if (!norm(op.name)) {
            fail('Item needs a name')
            break
          }
          const c = ensureCategory(op.category || 'Other')
          let item = c.items.find(i => key(i.name) === key(op.name))
          if (!item) {
            item = {id: uniqueId('itm', op.name, ids), name: norm(op.name), modifierGroups: []}
            c.items.push(item)
          }
          for (const gName of op.modifierGroups || []) {
            const g = findGroup(next, gName)
            if (!g) fail(`No modifier group called “${gName}”`)
            else if (!item.modifierGroups.includes(g.id)) item.modifierGroups.push(g.id)
          }
          break
        }
        case 'renameItem': {
          const found = findItem(next, op.item)
          if (!found) fail(`No item called “${op.item}”`)
          else if (!norm(op.name)) fail('New name is empty')
          else found.item.name = norm(op.name)
          break
        }
        case 'removeItem': {
          const found = findItem(next, op.item)
          if (!found) fail(`No item called “${op.item}”`)
          else found.category.items.splice(found.category.items.indexOf(found.item), 1)
          break
        }
        case 'moveItem': {
          const found = findItem(next, op.item)
          if (!found) {
            fail(`No item called “${op.item}”`)
            break
          }
          const to = ensureCategory(op.to)
          found.category.items.splice(found.category.items.indexOf(found.item), 1)
          if (!to.items.some(i => key(i.name) === key(found.item.name))) to.items.push(found.item)
          break
        }
        case 'addModifierGroup':
          if (!norm(op.name)) fail('Modifier group needs a name')
          else ensureGroup(op)
          break
        case 'setModifierGroup': {
          const g = findGroup(next, op.group)
          if (!g) fail(`No modifier group called “${op.group}”`)
          else {
            if (op.select) g.select = op.select === 'multi' ? 'multi' : 'single'
            if (typeof op.required === 'boolean') g.required = op.required
          }
          break
        }
        case 'addOption': {
          const g = findGroup(next, op.group)
          if (!g) fail(`No modifier group called “${op.group}”`)
          else addOption(g, op.name)
          break
        }
        case 'attachGroup':
        case 'detachGroup': {
          const found = findItem(next, op.item)
          const g = findGroup(next, op.group)
          if (!found) fail(`No item called “${op.item}”`)
          else if (!g) fail(`No modifier group called “${op.group}”`)
          else if (op.op === 'attachGroup') {
            if (!found.item.modifierGroups.includes(g.id)) found.item.modifierGroups.push(g.id)
          } else found.item.modifierGroups = found.item.modifierGroups.filter(id => id !== g.id)
          break
        }
        default:
          fail(`Unknown operation “${op.op}”`)
          continue
      }
      applied.push(op)
    } catch (err) {
      fail(String(err.message || err))
    }
  }
  return {menu: tidy(next), applied, errors}
}

// Deterministic cleanup: drop dangling group refs, unused empty groups stay (the
// designer may still attach them), dedupe item group refs.
function tidy(menu) {
  const groupIds = new Set(menu.modifierGroups.map(g => g.id))
  for (const c of menu.categories) {
    for (const i of c.items) i.modifierGroups = [...new Set(i.modifierGroups.filter(id => groupIds.has(id)))]
  }
  return menu
}

// Problems a human should see before applying. Returns strings.
export function validateMenu(menu) {
  const problems = []
  const seen = new Set()
  for (const c of menu.categories) {
    if (!c.items.length) problems.push(`${c.name} has no items`)
    for (const i of c.items) {
      const k = key(i.name)
      if (seen.has(k)) problems.push(`“${i.name}” appears in more than one category`)
      seen.add(k)
    }
  }
  for (const g of menu.modifierGroups) if (!g.options.length) problems.push(`Modifier group “${g.name}” has no options`)
  return problems
}

export function summarize(before, after) {
  const count = m => ({
    categories: m?.categories?.length || 0,
    items: (m?.categories || []).reduce((n, c) => n + c.items.length, 0),
    groups: m?.modifierGroups?.length || 0
  })
  const a = count(before)
  const b = count(after)
  return {categories: b.categories - a.categories, items: b.items - a.items, groups: b.groups - a.groups, total: b}
}
