import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assistantInstructions, normalizeMenu} from '../js/sheffield/instructions.js'
import {SAMPLE_MENU} from '../js/sample-menu.js'

test('instructions carry the Sheffield persona, format and import path', () => {
  const text = assistantInstructions(null)
  assert.match(text, /^Please play Sheffield, the menu butler/)
  assert.match(text, /"modifierGroups": \[/)
  assert.match(text, /Menu → Sheffield → Import menu\.json/)
  assert.match(text, /Begin by greeting me as Sheffield/)
  assert.doesNotMatch(text, /Here is my current menu/)
})

test('instructions can embed the current menu as JSON to edit', () => {
  const text = assistantInstructions(SAMPLE_MENU)
  const json = text.match(/Here is my current menu[^`]*```json\n(.+)\n```/s)[1]
  assert.deepEqual(JSON.parse(json).categories.map(c => c.name), SAMPLE_MENU.categories.map(c => c.name))
})

test('normalizeMenu repairs common assistant mistakes and reports them', () => {
  const {menu, fixes, counts} = normalizeMenu(JSON.parse(readFileSync('test/fixtures/assistant-menu.json', 'utf8')))
  assert.deepEqual(counts, {categories: 2, items: 4, groups: 2})
  const items = Object.fromEntries(menu.categories.flatMap(c => c.items).map(i => [i.name, i]))
  assert.deepEqual(items['Classic Burger'].modifierGroups, ['mg_temp', 'mg_extras'], 'group referenced by name resolves to its id')
  assert.deepEqual(items['Mushroom Swiss Burger'].modifierGroups, ['mg_temp'], 'unknown group dropped')
  assert.equal(items['Mushroom Swiss Burger'].id, 'itm_mushroom_swiss_burger')
  assert.equal(items['Onion Rings'].id, 'itm_onion_rings', 'plain string items become items')
  assert.match(menu.categories[1].color, /^#/)
  assert.deepEqual(menu.modifierGroups[1].options.map(o => o.name), ['Add avocado', 'Add fried egg'])
  assert.ok(fixes.some(f => f.includes('mg_missing')))
  assert.ok(fixes.some(f => f.includes('colour for Sides')))
})

test('normalizeMenu keeps a clean menu unchanged and rejects non-menus', () => {
  const {menu, fixes} = normalizeMenu(structuredClone(SAMPLE_MENU))
  assert.deepEqual(fixes, [])
  assert.deepEqual(menu.categories, SAMPLE_MENU.categories)
  assert.deepEqual(menu.modifierGroups, SAMPLE_MENU.modifierGroups)
  assert.ok(normalizeMenu({hello: 1}).error)
  assert.ok(normalizeMenu({categories: []}).error)
  assert.ok(normalizeMenu(null).error)
})
