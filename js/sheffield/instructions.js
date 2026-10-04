// Sheffield instructions: a prompt for any chat assistant (ChatGPT, Claude,
// Gemini…) that plays Sheffield, asks clarifying questions, and returns a
// menu.json that Yes Chef imports (Menu → Import).

export function assistantInstructions(currentMenu) {
  const hasMenu = currentMenu?.categories?.length > 0
  return `Please play Sheffield, the menu butler from my restaurant's tablet app, Yes Chef.

Sheffield is a cute little butler: polite, warm and unflappable, with a light touch of old-fashioned charm ("Very good." "Shall I…?" "If I may…"). Keep every reply brief, because I'm busy running a kitchen. Stay in character, but never let the charm get in the way of getting the menu right.

I will share photos, files, or notes about the menu. Sheffield's job is to turn them into ONE JSON file the app can import.

Before writing the file, ask me short clarifying questions about anything unclear, in Sheffield's voice (for example: "Shall the fries be a side of their own, or an add-on to the burgers?"). Things worth asking about:
- which section a dish belongs in,
- whether an add-on or choice applies to one dish or the whole section,
- whether a choice is required (guests must pick one) or optional.
Ask all your questions at once, then wait for my answers.

Rules:
- Dishes become items inside categories (Burgers, Sides, Drinks…).
- Choices and add-ons become modifier groups: "select" is "single" (pick one) or "multi" (pick any); "required" is true when guests must choose.
- Items list the ids of the modifier groups they use. A group can be shared by many items.
- Ignore prices, descriptions and allergens; the app does not store them.
- Ids must be unique, lowercase, and start with cat_, itm_, mg_ or opt_.
- Colors are hex codes; give each category a different one.

The file must match this shape exactly:
\`\`\`json
{
  "version": 1,
  "categories": [
    { "id": "cat_burgers", "name": "Burgers", "color": "#E07A5F",
      "items": [
        { "id": "itm_classic", "name": "Classic Burger", "modifierGroups": ["mg_temp", "mg_extras"] }
      ] }
  ],
  "modifierGroups": [
    { "id": "mg_temp", "name": "Temperature", "select": "single", "required": true,
      "options": [{ "id": "opt_mr", "name": "Medium rare" }, { "id": "opt_wd", "name": "Well done" }] },
    { "id": "mg_extras", "name": "Extras", "select": "multi", "required": false,
      "options": [{ "id": "opt_bacon", "name": "Add bacon" }] }
  ]
}
\`\`\`
${hasMenu ? `
Here is my current menu. Start from it: keep its ids, and change only what I ask.
\`\`\`json
${JSON.stringify({categories: currentMenu.categories, modifierGroups: currentMenu.modifierGroups})}
\`\`\`
` : ''}
When we're done, give me the complete JSON as a downloadable file named menu.json (or in a single code block I can save as menu.json), with a one-line Sheffield sign-off. I'll import it in Yes Chef under Menu → Sheffield → Import menu.json.

Begin by greeting me as Sheffield and asking me to share the menu.`
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older Safari / non-secure contexts: fall back to a hidden textarea.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.append(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function downloadText(text, filename) {
  const blob = new Blob([text], {type: 'text/plain'})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.append(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

const PALETTE = ['#E07A5F', '#F2CC8F', '#81B29A', '#3D85C6', '#9C89B8', '#F28482', '#84A59D', '#E9C46A', '#6D6875', '#2A9D8F']

// Checks and tidies a menu.json from an assistant. Repairs what is safe to
// repair (missing ids/colours, dangling or duplicate references) and reports
// it; returns {error} when the file isn't a menu at all.
export function normalizeMenu(data) {
  if (!data || typeof data !== 'object') return {error: 'That file isn’t JSON menu data.'}
  if (!Array.isArray(data.categories)) return {error: 'That file has no "categories" list, so it isn’t a Yes Chef menu.'}
  const fixes = []
  const taken = new Set()
  const id = (prefix, raw, name) => {
    let v = typeof raw === 'string' && raw.trim() ? raw.trim() : `${prefix}_${String(name || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x'}`
    if (!raw) fixes.push(`gave “${name}” an id`)
    const base = v
    for (let n = 2; taken.has(v); n++) v = `${base}_${n}`
    if (v !== base) fixes.push(`renamed a duplicate id ${base}`)
    taken.add(v)
    return v
  }
  const text = v => String(v ?? '').trim()

  const modifierGroups = (Array.isArray(data.modifierGroups) ? data.modifierGroups : [])
    .filter(g => g && text(g.name))
    .map(g => ({
      id: id('mg', g.id, g.name),
      name: text(g.name),
      select: g.select === 'multi' ? 'multi' : 'single',
      required: Boolean(g.required),
      options: (Array.isArray(g.options) ? g.options : [])
        .map(o => (typeof o === 'string' ? {name: o} : o))
        .filter(o => o && text(o.name))
        .map(o => ({id: id('opt', o.id, o.name), name: text(o.name)}))
    }))
  for (const g of modifierGroups) if (!g.options.length) fixes.push(`choice group “${g.name}” has no options`)
  const groupIds = new Set(modifierGroups.map(g => g.id))
  const groupByName = new Map(modifierGroups.map(g => [g.name.toLowerCase(), g.id]))

  const categories = data.categories
    .filter(c => c && text(c.name))
    .map((c, i) => {
      const color = /^#[0-9a-f]{3,8}$/i.test(c.color || '') ? c.color : PALETTE[i % PALETTE.length]
      if (color !== c.color) fixes.push(`picked a colour for ${text(c.name)}`)
      return {
        id: id('cat', c.id, c.name),
        name: text(c.name),
        color,
        items: (Array.isArray(c.items) ? c.items : [])
          .map(it => (typeof it === 'string' ? {name: it} : it))
          .filter(it => it && text(it.name))
          .map(it => {
            const refs = []
            for (const ref of Array.isArray(it.modifierGroups) ? it.modifierGroups : []) {
              // Assistants sometimes use the group's name instead of its id.
              const resolved = groupIds.has(ref) ? ref : groupByName.get(String(ref).toLowerCase())
              if (!resolved) fixes.push(`dropped unknown choice group “${ref}” from ${text(it.name)}`)
              else if (!refs.includes(resolved)) refs.push(resolved)
            }
            return {id: id('itm', it.id, it.name), name: text(it.name), modifierGroups: refs}
          })
      }
    })
  if (!categories.length) return {error: 'That menu has no categories.'}
  const items = categories.reduce((n, c) => n + c.items.length, 0)
  return {menu: {version: 0, categories, modifierGroups}, fixes, counts: {categories: categories.length, items, groups: modifierGroups.length}}
}
