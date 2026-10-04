// Exact handling for the common typed edits, so they never depend on a model:
//   add Brownie and Apple Pie to Desserts · remove the veggie burger
//   rename Cola to Coke · move Fries to Sides · new category Desserts
//   add Add cheese to Extras (option) · undo
// Returns {ops, say} or null when the sentence isn't recognised.

import {findCategory, findGroup, findItem} from './ops.js'

const strip = s => s.trim().replace(/^(?:the|a|an|some)\s+/i, '').replace(/[.!]+$/, '').trim()
const list = s => s.split(/\s*(?:,|\band\b|&)\s*/i).map(strip).filter(Boolean)
const cap = s => s.replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase())

// Matches menu entries case-insensitively and tolerates a missing/extra "the".
function resolveItem(menu, name) {
  const direct = findItem(menu, name)
  if (direct) return direct.item.name
  const k = name.toLowerCase()
  for (const c of menu.categories) for (const i of c.items) if (i.name.toLowerCase() === k || i.name.toLowerCase().replace(/s$/, '') === k.replace(/s$/, '')) return i.name
  return null
}

export function parseCommand(text, menu) {
  const t = text.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')
  let m

  if ((m = /^(?:new|add(?: a)?(?: new)?) (?:category|section) (?:called |named )?(.+)$/i.exec(t))) {
    const names = list(m[1]).map(cap)
    return {ops: names.map(name => ({op: 'addCategory', name})), say: `New ${names.length > 1 ? 'categories' : 'category'}: ${names.join(', ')}.`}
  }

  if ((m = /^(?:rename|call) (.+?) (?:to|as) (.+)$/i.exec(t))) {
    const from = strip(m[1])
    const to = cap(strip(m[2]))
    const item = resolveItem(menu, from)
    if (item) return {ops: [{op: 'renameItem', item, name: to}], say: `${item} shall henceforth be ${to}.`}
    const cat = findCategory(menu, from)
    if (cat) return {ops: [{op: 'renameCategory', category: cat.name, name: to}], say: `The ${cat.name} section is now ${to}.`}
    return null
  }

  if ((m = /^(?:move|put) (.+?) (?:to|into|in|under) (.+)$/i.exec(t))) {
    const items = list(m[1]).map(n => resolveItem(menu, n))
    if (items.some(i => !i)) return null
    const to = cap(strip(m[2]).replace(/\s+(?:section|category)$/i, ''))
    return {ops: items.map(item => ({op: 'moveItem', item, to})), say: `Moved ${items.join(', ')} to ${to}.`}
  }

  if ((m = /^(?:remove|delete|take|drop|86) (.+?)(?: (?:off|from) (?:the )?menu)?$/i.exec(t))) {
    const target = strip(m[1].replace(/\s+off$/i, ''))
    const cat = findCategory(menu, target.replace(/\s+(?:section|category)$/i, ''))
    if (cat && /section|category/i.test(target)) return {ops: [{op: 'removeCategory', category: cat.name}], say: `The ${cat.name} section has been cleared away.`}
    const items = list(target).map(n => resolveItem(menu, n))
    if (!items.length || items.some(i => !i)) return null
    return {ops: items.map(item => ({op: 'removeItem', item})), say: `${items.join(', ')} ${items.length > 1 ? 'are' : 'is'} off the menu.`}
  }

  if ((m = /^add (.+?) (?:to|in|under|into) (.+)$/i.exec(t))) {
    const where = strip(m[2]).replace(/\s+(?:section|category|group|options?)$/i, '')
    const names = list(m[1]).map(cap)
    const group = findGroup(menu, where)
    if (group) return {ops: names.map(name => ({op: 'addOption', group: group.name, name})), say: `${names.join(', ')} added to ${group.name}.`}
    const item = resolveItem(menu, where)
    if (item) {
      // "add bacon to the classic burger" → an extra on that dish.
      return {
        ops: [{op: 'addModifierGroup', name: 'Extras', select: 'multi', required: false, options: names}, {op: 'attachGroup', item, group: 'Extras'}],
        say: `${item} may now come with ${names.join(', ')}.`
      }
    }
    const category = findCategory(menu, where)?.name || cap(where)
    return {ops: names.map(name => ({op: 'addItem', category, name})), say: `${names.join(', ')} added to ${category}.`}
  }

  return null
}
