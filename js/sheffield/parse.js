// Rule-based menu reader: text, CSV and Yes Chef JSON → a plan that Sheffield
// can ask about, then compile into ops. Works with no model downloaded.
//
// Plan shape:
//   {categories: [{name, items: [{name, groups: [{name, select, required, options}]}],
//                  sharedExtras: [option names] }],
//    loose: [{name, groups}],     // items seen before any heading
//    orphanExtras: [{section, options}], // extras with no item before them
//    skipped: [lines]}

const PRICE = /(?:\s*[.·…_-]{2,}\s*|\s+)?(?:[$£€¥]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{2})\s?(?:[$£€]|kr|zł)?|\d+\s?[$£€])\s*$/
const BULLET = /^\s*(?:[-*•·▪◦]|\d+[.)])\s+/
const MOD_START = /^(?:\+|add|extra|with|without|no|sub|substitute|swap|make it|side of)\b/i
const CHOICE = /^(?:choice of|choose(?: from)?|served with (?:your )?choice of|pick)\s*:?\s*(.+)$/i
const LABELED_LIST = /^([A-Za-z][\w ]{1,24}):\s*(.+[,/|].+)$/
const ASKED_LIST = /^[^?]{3,40}\?\s*(.+(?:[,/|]|\bor\b).+)$/i
const DONENESS = /^(?:blue|rare|medium[ -]?rare|medium|medium[ -]?well|well[ -]?done)$/i
const SPLIT_LIST = /\s*(?:,|\/|\||\bor\b|\band\b)\s*/i

const clean = s => s.replace(BULLET, '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim()
const hasPrice = s => PRICE.test(s)
const stripPrice = s => s.replace(PRICE, '').replace(/\s*[(\[]\s*[+]?\s*[$£€]?\d+(?:[.,]\d{1,2})?\s*[)\]]\s*$/, '').replace(/\s*\+\s*$/, '').trim()
const title = s => (s === s.toUpperCase() && /[A-Z]{2}/.test(s) ? s.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase()) : s)
const cap = s => s.replace(/^./, c => c.toUpperCase())
const listItems = s => s.split(SPLIT_LIST).map(x => cap(title(stripPrice(x).replace(/\.$/, '').trim()))).filter(Boolean)
const PRICE_ANY = /\s*[.·…_]{2,}\s*|\s*(?:[$£€¥]\s?\d+(?:[.,]\d{1,2})?|\b\d+[.,]\d{2}\b)\s*/g
const SIZES = /^(?:small|medium|large|regular|kids?|half|full|single|double|xl|s|m|l)$/i

// "Side Salad ... $5 (ranch or vinaigrette)", "Soda (small / large) $2",
// "Milkshake — vanilla, chocolate or strawberry $6" → name + inline choice group.
function splitInline(line) {
  const text = line.replace(PRICE_ANY, ' ').replace(/\s+/g, ' ').trim()
  let m = /^(.*?)\s*[(\[]([^)\]]+)[)\]]\s*(.*)$/.exec(text)
  let name
  let list
  if (m && SPLIT_LIST.test(m[2])) {
    name = `${m[1]} ${m[3]}`.trim()
    list = m[2]
  } else if ((m = /^(.*?)\s+[—–-]\s+(.+)$/.exec(text)) && SPLIT_LIST.test(m[2])) {
    name = m[1]
    list = m[2]
  }
  if (!name || !list) return null
  const options = listItems(list)
  if (options.length < 2) return null
  const isSize = options.every(o => SIZES.test(o))
  return {name: title(name), group: {name: isSize ? 'Size' : `${title(name)} choice`, select: 'single', required: true, options}}
}

function isHeading(raw, line, nextLine, docHasPrices) {
  if (/^#+\s/.test(raw)) return true
  if (hasPrice(line)) return false
  if (/:\s*$/.test(line) && !LABELED_LIST.test(line)) return true
  const letters = line.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 3 && letters === letters.toUpperCase() && line.split(' ').length <= 5) return true
  // In a priced menu, an unpriced short line followed by a priced line is a section.
  return Boolean(docHasPrices && nextLine && hasPrice(nextLine) && !MOD_START.test(line) && line.split(' ').length <= 4 && !/^[a-z]/.test(line))
}

export function looksLikeCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return false
  const delim = (lines[0].match(/\t/g) || []).length ? '\t' : ','
  const counts = lines.map(l => splitCsvLine(l, delim).length)
  return counts[0] >= 2 && counts.filter(c => c === counts[0]).length >= lines.length * 0.8
}

function splitCsvLine(line, delim) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

export function emptyPlan() {
  return {categories: [], loose: [], orphanExtras: [], skipped: []}
}

function sectionOf(plan, name) {
  let s = plan.categories.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (!s) {
    s = {name, items: [], sharedExtras: []}
    plan.categories.push(s)
  }
  return s
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const delim = lines[0].includes('\t') ? '\t' : ','
  const rows = lines.map(l => splitCsvLine(l, delim))
  const header = rows[0].map(h => h.toLowerCase())
  const hasHeader = header.some(h => /categor|section|item|dish|name|modif|option|extra/.test(h))
  const col = (re, fallback) => {
    const i = header.findIndex(h => re.test(h))
    return hasHeader && i >= 0 ? i : fallback
  }
  const width = rows[0].length
  const cat = col(/categor|section|group|type/, width >= 2 ? 0 : -1)
  const item = col(/item|dish|name|product/, width >= 2 ? 1 : 0)
  const mods = col(/modif|option|extra|add.?on/, -1)
  const plan = emptyPlan()
  for (const row of hasHeader ? rows.slice(1) : rows) {
    const name = stripPrice(row[item] || '')
    if (!name) continue
    const entry = {name: title(name), groups: []}
    const modText = mods >= 0 ? row[mods] : ''
    if (modText) entry.groups.push({name: 'Extras', select: 'multi', required: false, options: modText.split(/[;|]/).map(s => stripPrice(s.trim())).filter(Boolean)})
    const catName = cat >= 0 ? title((row[cat] || '').trim()) : ''
    if (catName) sectionOf(plan, catName).items.push(entry)
    else plan.loose.push(entry)
  }
  return plan
}

export function parseText(text) {
  const raw = text.split(/\r?\n/)
  const lines = raw.map(clean)
  const docHasPrices = lines.filter(hasPrice).length >= 2
  const plan = emptyPlan()
  let section = null
  let lastItem = null

  const addItem = name => {
    const entry = {name: title(name), groups: []}
    if (section) section.items.push(entry)
    else plan.loose.push(entry)
    lastItem = entry
    return entry
  }
  // A choice/extras line after several dishes may be meant for the whole
  // section; attach it to the last dish and let Sheffield ask.
  const markScope = group => {
    if (group && section && section.items.length > 1) group.scope = {section: section.name, item: lastItem.name}
  }
  const attachToSection = group => {
    lastItem.groups.push(group)
    markScope(group)
  }
  const extrasFor = () => {
    if (lastItem) {
      let g = lastItem.groups.find(g => g.name === 'Extras')
      if (!g) {
        g = {name: 'Extras', select: 'multi', required: false, options: []}
        lastItem.groups.push(g)
      }
      return g.options
    }
    const key = section?.name || null
    let orphan = plan.orphanExtras.find(o => o.section === key)
    if (!orphan) {
      orphan = {section: key, options: []}
      plan.orphanExtras.push(orphan)
    }
    return orphan.options
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const next = lines.slice(i + 1).find(Boolean)

    if (!section && !lastItem && !hasPrice(line) && next && isHeading(raw[lines.indexOf(next, i + 1)], next, lines.slice(lines.indexOf(next, i + 1) + 1).find(Boolean), docHasPrices) && !isHeading(raw[i], line, next, docHasPrices)) {
      plan.title = line
      continue
    }

    if (isHeading(raw[i], line, next, docHasPrices)) {
      section = sectionOf(plan, title(line.replace(/:\s*$/, '')))
      lastItem = null
      continue
    }

    const choice = CHOICE.exec(line)
    const labeled = !choice && LABELED_LIST.exec(line)
    const asked = !choice && !labeled && ASKED_LIST.exec(line)
    if (choice || labeled || asked) {
      const options = listItems(choice ? choice[1] : labeled ? labeled[2] : asked[1])
      const doneness = options.every(o => DONENESS.test(o))
      const isSize = options.every(o => SIZES.test(o))
      const name = doneness ? 'Temperature' : isSize ? 'Size' : labeled ? title(labeled[1].trim()) : 'Choice'
      const group = {name, select: 'single', required: Boolean(choice || asked || doneness || isSize) || /temp|size|cook/i.test(labeled?.[1] || ''), options}
      if (lastItem) attachToSection(group)
      else plan.skipped.push(line)
      continue
    }

    if (MOD_START.test(line)) {
      // "Add avocado +$2   Add fried egg +$1.50" holds two add-ons.
      const parts = line.split(/\s+(?=(?:add|extra|no|sub|with)\b)/i).filter(Boolean)
      const target = extrasFor()
      for (const part of parts) target.push(cap(stripPrice(part.replace(/^\+\s*/, ''))))
      if (lastItem && section && section.items.length > 1) markScope(lastItem.groups.find(g => g.name === 'Extras'))
      continue
    }

    // Unpriced lower-case lines under a priced item read as descriptions.
    if (docHasPrices && !hasPrice(line) && lastItem && (/^[a-z]/.test(line) || line.split(' ').length > 8)) {
      plan.skipped.push(line)
      continue
    }

    const inline = splitInline(line)
    if (inline) {
      addItem(inline.name).groups.push(inline.group)
      continue
    }
    const name = stripPrice(line)
    if (name && name.length <= 60) addItem(name)
    else if (name) plan.skipped.push(line)
  }

  plan.categories = plan.categories.filter(c => c.items.length || plan.orphanExtras.some(o => o.section === c.name))
  return plan
}

export function parseMenuJson(data) {
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.modifierGroups)) return null
  const groupById = new Map(data.modifierGroups.map(g => [g.id, g]))
  const plan = emptyPlan()
  for (const c of data.categories) {
    plan.categories.push({
      name: c.name,
      color: c.color,
      sharedExtras: [],
      items: (c.items || []).map(i => ({
        name: i.name,
        groups: (i.modifierGroups || []).map(id => groupById.get(id)).filter(Boolean).map(g => ({name: g.name, select: g.select, required: g.required, options: g.options.map(o => o.name)}))
      }))
    })
  }
  return plan
}

export function parseAny(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    try {
      const plan = parseMenuJson(JSON.parse(trimmed))
      if (plan) return plan
    } catch {}
  }
  return looksLikeCsv(trimmed) ? parseCsv(trimmed) : parseText(trimmed)
}

export function planCounts(plan) {
  const items = plan.categories.reduce((n, c) => n + c.items.length, 0) + plan.loose.length
  return {categories: plan.categories.length, items}
}

// ---------- questions ----------
// Each question: {id, text, choices: [{label, value}], allowText?}. Answers are
// applied with answerQuestion(plan, question, value) which returns a new plan.

export function nextQuestion(plan, {existingCategories = [], draftHasItems = false, mergeDecided = false} = {}) {
  if (plan.loose.length) {
    const names = [...new Set([...plan.categories.map(c => c.name), ...existingCategories])]
    const sample = plan.loose.slice(0, 3).map(i => `“${i.name}”`).join(', ')
    return {
      id: 'loose',
      text: plan.loose.length === 1
        ? `Which category shall ${sample} go in?`
        : `${plan.loose.length} items (${sample}${plan.loose.length > 3 ? '…' : ''}) have no category. Where shall they go?`,
      choices: [...names.slice(0, 6).map(n => ({label: n, value: n})), {label: 'New category “Mains”', value: 'Mains'}],
      allowText: true
    }
  }
  const orphan = plan.orphanExtras[0]
  if (orphan) {
    const where = orphan.section ? ` under ${orphan.section}` : ''
    const opts = orphan.options.slice(0, 3).map(o => `“${o}”`).join(', ')
    return {
      id: 'orphan',
      text: `I found extras${where} (${opts}) without a dish before them. Are they add-ons for every dish${where}, or dishes of their own?`,
      choices: [
        {label: orphan.section ? `Add-ons for all ${orphan.section}` : 'Add-ons for every dish', value: 'shared'},
        {label: 'Dishes of their own', value: 'items'},
        {label: 'Leave them out', value: 'drop'}
      ]
    }
  }
  const scoped = findScoped(plan)
  if (scoped) {
    const {group} = scoped
    return {
      id: 'scope',
      text: `Does “${group.options.slice(0, 3).join(' / ')}” apply to every dish in ${group.scope.section}, or only ${group.scope.item}?`,
      choices: [
        {label: `Every ${group.scope.section} dish`, value: 'all'},
        {label: `Only ${group.scope.item}`, value: 'one'}
      ]
    }
  }
  const dup = findDuplicate(plan)
  if (dup) {
    return {
      id: 'dup',
      text: `“${dup.name}” appears in ${dup.sections.join(' and ')}. Keep both, or only the first?`,
      choices: [
        {label: 'Keep both, renamed', value: 'rename'},
        {label: `Only in ${dup.sections[0]}`, value: 'first'}
      ]
    }
  }
  const required = findUnsureRequired(plan)
  if (required) {
    return {
      id: 'required',
      text: `Must guests choose a ${required.name.toLowerCase()} (${required.options.slice(0, 3).join(', ')}), or is it optional?`,
      choices: [
        {label: 'They must choose', value: 'required'},
        {label: 'Optional', value: 'optional'}
      ]
    }
  }
  if (draftHasItems && !mergeDecided) {
    return {
      id: 'merge',
      text: 'Shall I add these to your current menu, or replace it entirely?',
      choices: [
        {label: 'Add to current menu', value: 'merge'},
        {label: 'Replace current menu', value: 'replace'}
      ]
    }
  }
  return null
}

function findScoped(plan) {
  for (const c of plan.categories) {
    for (const i of c.items) {
      const group = i.groups.find(g => g.scope)
      if (group) return {category: c, item: i, group}
    }
  }
  return null
}

function findDuplicate(plan) {
  const seen = new Map()
  for (const c of plan.categories) {
    for (const i of c.items) {
      const k = i.name.toLowerCase()
      if (seen.has(k) && seen.get(k) !== c.name) return {name: i.name, sections: [seen.get(k), c.name]}
      if (!seen.has(k)) seen.set(k, c.name)
    }
  }
  return null
}

function findUnsureRequired(plan) {
  for (const c of plan.categories) {
    for (const i of c.items) {
      for (const g of i.groups) if (g.select === 'single' && g.required === false && !g.asked) return g
    }
  }
  return null
}

export function answerQuestion(plan, question, value) {
  const p = structuredClone(plan)
  const v = String(value || '').trim()
  if (question.id === 'loose') {
    const target = sectionOf(p, title(v || 'Mains'))
    target.items.push(...p.loose)
    p.loose = []
  } else if (question.id === 'orphan') {
    const orphan = p.orphanExtras.shift()
    const section = orphan.section ? sectionOf(p, orphan.section) : null
    if (v === 'shared') {
      const targets = section ? [section] : p.categories
      for (const s of targets) s.sharedExtras.push(...orphan.options)
    } else if (v === 'items') {
      const into = section || sectionOf(p, 'Extras')
      into.items.push(...orphan.options.map(name => ({name, groups: []})))
    }
  } else if (question.id === 'scope') {
    const found = findScoped(p)
    const {category, group} = found
    delete group.scope
    if (v === 'all') {
      for (const item of category.items) {
        if (item === found.item) continue
        if (!item.groups.some(g => g.name === group.name && JSON.stringify(g.options) === JSON.stringify(group.options))) item.groups.push(structuredClone(group))
      }
    }
  } else if (question.id === 'dup') {
    const dup = findDuplicate(p)
    for (const c of p.categories) {
      if (c.name !== dup.sections[1]) continue
      const idx = c.items.findIndex(i => i.name.toLowerCase() === dup.name.toLowerCase())
      if (v === 'first') c.items.splice(idx, 1)
      else c.items[idx].name = `${c.items[idx].name} (${c.name})`
    }
  } else if (question.id === 'required') {
    for (const c of p.categories) {
      for (const i of c.items) {
        for (const g of i.groups) {
          if (g.name === question.groupName || (g.select === 'single' && g.required === false && !g.asked)) {
            g.required = v === 'required'
            g.asked = true
          }
        }
        if (question.groupName) continue
      }
    }
  }
  return p
}

// ---------- compile ----------

// Plan → ops. Groups with the same name and options are shared; same name with
// different options get the category appended so they stay distinct.
export function compilePlan(plan) {
  const ops = []
  const groups = new Map() // name → [{options, select, required, finalName}]
  const groupName = (spec, categoryName) => {
    const sig = JSON.stringify([spec.select, spec.required, [...spec.options].sort()])
    const list = groups.get(spec.name) || []
    let found = list.find(g => g.sig === sig)
    if (!found) {
      let finalName = list.length ? `${spec.name} (${categoryName})` : spec.name
      for (let n = 2; [...groups.values()].flat().some(g => g.finalName === finalName); n++) finalName = `${spec.name} (${categoryName} ${n})`
      found = {sig, finalName}
      list.push(found)
      groups.set(spec.name, list)
      ops.push({op: 'addModifierGroup', name: finalName, select: spec.select, required: spec.required, options: spec.options})
    }
    return found.finalName
  }

  for (const c of plan.categories) {
    if (!c.items.length) continue
    ops.push({op: 'addCategory', name: c.name, ...(c.color ? {color: c.color} : {})})
    const shared = c.sharedExtras?.length ? groupName({name: 'Extras', select: 'multi', required: false, options: [...new Set(c.sharedExtras)]}, c.name) : null
    for (const i of c.items) {
      const names = i.groups.filter(g => g.options.length).map(g => groupName({...g, options: [...new Set(g.options)]}, c.name))
      if (shared && !names.includes(shared)) names.push(shared)
      ops.push({op: 'addItem', category: c.name, name: i.name, modifierGroups: names})
    }
  }
  return ops
}
