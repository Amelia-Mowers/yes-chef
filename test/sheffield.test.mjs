import {test} from 'node:test'
import assert from 'node:assert/strict'
import {applyOps, validateMenu} from '../js/sheffield/ops.js'
import {parseText, parseCsv, parseAny, compilePlan, nextQuestion, answerQuestion, looksLikeCsv} from '../js/sheffield/parse.js'
import {parseReply} from '../js/sheffield/prompt.js'

const empty = {version: 0, categories: [], modifierGroups: []}
const names = menu => Object.fromEntries(menu.categories.map(c => [c.name, c.items.map(i => i.name)]))
const groupOf = (menu, item) => {
  const it = menu.categories.flatMap(c => c.items).find(i => i.name === item)
  return it.modifierGroups.map(id => menu.modifierGroups.find(g => g.id === id).name)
}

test('ops resolve names, own ids and colours, and skip bad edits', () => {
  const {menu, errors} = applyOps(empty, [
    {op: 'addModifierGroup', name: 'Temperature', select: 'single', required: true, options: ['Rare', 'Medium', 'Rare']},
    {op: 'addItem', category: 'Burgers', name: 'Classic', modifierGroups: ['Temperature', 'Nope']},
    {op: 'addItem', category: 'burgers', name: 'classic'},
    {op: 'moveItem', item: 'Classic', to: 'Specials'},
    {op: 'fly'}
  ])
  assert.deepEqual(names(menu), {Burgers: [], Specials: ['Classic']})
  assert.deepEqual(menu.modifierGroups[0].options.map(o => o.name), ['Rare', 'Medium'])
  assert.equal(menu.categories[0].id, 'cat_burgers')
  assert.notEqual(menu.categories[0].color, menu.categories[1].color)
  assert.deepEqual(errors.map(e => e.error), ['No modifier group called “Nope”', 'Unknown operation “fly”'])
  assert.deepEqual(validateMenu(menu), ['Burgers has no items'])
})

// What the model transcribes from test/fixtures/chalkboard-menu.jpg.
const DINER = `Joe's Diner
BURGERS
Classic Burger ........ $12
Bacon Cheeseburger ..... $14
Mushroom Swiss Burger .. $14
How do you like it? Rare / Medium / Well done
Add avocado +$2   Add fried egg +$1.50
SIDES
Fries ........ $4
Onion Rings .. $5
Side Salad ... $5 (ranch or vinaigrette)
DRINKS
Soda (small / large) $2
Milkshake — vanilla, chocolate or strawberry $6`

test('text parser finds sections, dishes and extras in a priced menu', () => {
  const plan = parseText(DINER)
  assert.deepEqual(plan.categories.map(c => c.name), ['Burgers', 'Sides', 'Drinks'])
  assert.deepEqual(plan.categories[0].items.map(i => i.name), ['Classic Burger', 'Bacon Cheeseburger', 'Mushroom Swiss Burger'])
  assert.deepEqual(plan.categories[1].items.map(i => i.name), ['Fries', 'Onion Rings', 'Side Salad'])
  assert.equal(plan.loose.length, 0)
})

test('questions resolve into a valid menu', () => {
  let plan = parseText(`Classic Burger $12\nVeggie Burger $11\nAdd bacon +$2\nDESSERTS\nBrownie $5`)
  const q1 = nextQuestion(plan)
  assert.equal(q1.id, 'loose')
  plan = answerQuestion(plan, q1, 'Burgers')
  const {menu} = applyOps(empty, compilePlan(plan))
  assert.deepEqual(names(menu), {Desserts: ['Brownie'], Burgers: ['Classic Burger', 'Veggie Burger']})
  assert.deepEqual(groupOf(menu, 'Veggie Burger'), ['Extras'])
  assert.deepEqual(groupOf(menu, 'Classic Burger'), [])
})

test('extras before any dish trigger a question', () => {
  let plan = parseText(`BURGERS:\nAdd cheese\nClassic $10\nDouble $12`)
  const q = nextQuestion(plan)
  assert.equal(q.id, 'orphan')
  plan = answerQuestion(plan, q, 'shared')
  const {menu} = applyOps(empty, compilePlan(plan))
  assert.deepEqual(groupOf(menu, 'Double'), ['Extras'])
})

test('choice lists become required single-choice groups', () => {
  const plan = parseText(`MAINS\nSteak $25\nChoice of: fries, salad or mash`)
  const {menu} = applyOps(empty, compilePlan(plan))
  const g = menu.modifierGroups[0]
  assert.equal(g.select, 'single')
  assert.equal(g.required, true)
  assert.deepEqual(g.options.map(o => o.name), ['Fries', 'Salad', 'Mash'])
})

test('CSV with header and modifiers column', () => {
  const csv = 'Category,Item,Modifiers\nBurgers,Classic,"Add bacon; No onion"\nDrinks,Cola,\n'
  assert.ok(looksLikeCsv(csv))
  const {menu} = applyOps(empty, compilePlan(parseCsv(csv)))
  assert.deepEqual(names(menu), {Burgers: ['Classic'], Drinks: ['Cola']})
  assert.deepEqual(menu.modifierGroups[0].options.map(o => o.name), ['Add bacon', 'No onion'])
})

test('Yes Chef menu JSON round-trips through parseAny', async () => {
  const {SAMPLE_MENU} = await import('../js/sample-menu.js')
  const {menu} = applyOps(empty, compilePlan(parseAny(JSON.stringify(SAMPLE_MENU))))
  assert.deepEqual(names(menu), names(SAMPLE_MENU))
})

test('merge question only when the draft already has items', () => {
  const plan = parseText('MAINS\nSteak $20')
  assert.equal(nextQuestion(plan), null)
  assert.equal(nextQuestion(plan, {draftHasItems: true}).id, 'merge')
  assert.equal(nextQuestion(plan, {draftHasItems: true, mergeDecided: true}), null)
})

test('model replies: fenced, truncated, and string questions', () => {
  assert.deepEqual(parseReply('```json\n{"say":"ok","ops":[{"op":"addCategory","name":"Fries"}]\n```').ops, [{op: 'addCategory', name: 'Fries'}])
  assert.equal(parseReply('{"say":"x","ops":[],"questions":["Which category?"]}').questions[0].text, 'Which category?')
  assert.ok(parseReply('no json here').error)
  assert.ok(parseReply('{"say": "cut').error)
})

test('the diner photo transcription becomes a full menu after two questions', () => {
  let plan = parseText(DINER)
  assert.equal(plan.title, "Joe's Diner")
  const asked = []
  for (let q = nextQuestion(plan); q; q = nextQuestion(plan)) {
    asked.push(q.id)
    plan = answerQuestion(plan, q, 'all')
  }
  assert.deepEqual(asked, ['scope', 'scope'])
  const {menu} = applyOps(empty, compilePlan(plan))
  assert.deepEqual(names(menu), {
    Burgers: ['Classic Burger', 'Bacon Cheeseburger', 'Mushroom Swiss Burger'],
    Sides: ['Fries', 'Onion Rings', 'Side Salad'],
    Drinks: ['Soda', 'Milkshake']
  })
  assert.deepEqual(groupOf(menu, 'Classic Burger'), ['Temperature', 'Extras'])
  const extras = menu.modifierGroups.find(g => g.name === 'Extras')
  assert.deepEqual(extras.options.map(o => o.name), ['Add avocado', 'Add fried egg'])
  assert.deepEqual(validateMenu(menu), [])
})

test('typed commands handle common edits without a model', async () => {
  const {parseCommand} = await import('../js/sheffield/commands.js')
  const {SAMPLE_MENU} = await import('../js/sample-menu.js')
  const run = text => {
    const cmd = parseCommand(text, SAMPLE_MENU)
    return cmd && applyOps(SAMPLE_MENU, cmd.ops)
  }
  assert.deepEqual(names(run('Add Brownie and Apple Pie to Desserts').menu).Desserts, ['Brownie', 'Apple Pie'])
  assert.deepEqual(names(run('add root beer to drinks').menu).Drinks.at(-1), 'Root Beer')
  assert.ok(findName(run('Rename Cola to Coke').menu, 'Coke'))
  assert.equal(findName(run('Take the veggie burger off the menu.').menu, 'Veggie Burger'), undefined)
  assert.deepEqual(names(run('move fries to burgers').menu).Burgers.at(-1), 'Fries')
  assert.deepEqual(groupOf(run('add jalapeños to the classic burger').menu, 'Classic Burger'), ['Temperature', 'Extras'])
  assert.equal(parseCommand('Add fries.', SAMPLE_MENU), null, 'no category given: left to the model or a question')
  assert.equal(parseCommand('What do you think of my menu?', SAMPLE_MENU), null)
})

function findName(menu, name) {
  return menu.categories.flatMap(c => c.items).find(i => i.name === name)
}

test('assistant instructions carry the Sheffield persona, schema and current menu', async () => {
  const {assistantInstructions} = await import('../js/sheffield/handoff.js')
  const {SAMPLE_MENU} = await import('../js/sample-menu.js')
  const text = assistantInstructions(SAMPLE_MENU)
  assert.match(text, /^Please play Sheffield, the menu butler/)
  assert.match(text, /"modifierGroups": \[/)
  assert.match(text, /Burgers: Classic Burger \[Temperature, Extras\]/)
  assert.match(text, /Begin by greeting me as Sheffield/)
  assert.doesNotMatch(assistantInstructions(null), /My current menu/)
})
