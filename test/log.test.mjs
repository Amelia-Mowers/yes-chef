import {test} from 'node:test'
import assert from 'node:assert/strict'
import {replay, undoneSet, nextOrderNumber, recallTarget, isOpen, diffLines, DEFAULT_SETTINGS} from '../js/log.js'

let seq = 0
const ev = (type, orderId, payload = {}, ts = Date.now()) => ({seq: ++seq, id: 'e' + seq, type, orderId, payload, device: 'd', ts})
const line = (itemName, qty = 1, modifiers = []) => ({itemName, qty, modifiers, note: ''})

test('undo, redo, and undo of redo', () => {
  seq = 0
  const created = ev('order.created', 'o1', {number: 1, name: 'Sam', lines: [line('Burger')]})
  const done = ev('status.changed', 'o1', {status: 'done'})
  const u1 = ev('undo', 'o1', {targetSeq: done.seq})
  let {orders} = replay([created, done, u1])
  assert.equal(orders.get('o1').status, 'new')
  const u2 = ev('undo', 'o1', {targetSeq: u1.seq})
  ;({orders} = replay([created, done, u1, u2]))
  assert.equal(orders.get('o1').status, 'done')
  const u3 = ev('undo', 'o1', {targetSeq: u2.seq})
  ;({orders} = replay([created, done, u1, u2, u3]))
  assert.equal(orders.get('o1').status, 'new')
  assert.deepEqual([...undoneSet([created, done, u1, u2, u3])].sort(), [done.seq, u2.seq])
})

test('undo of order.created hides the order but keeps it in history', () => {
  seq = 0
  const created = ev('order.created', 'o1', {number: 1, name: '', lines: [line('Fries')]})
  const u = ev('undo', 'o1', {targetSeq: created.seq})
  const {orders} = replay([created, u])
  assert.equal(orders.get('o1').undone, true)
  assert.equal(isOpen(orders.get('o1'), DEFAULT_SETTINGS), false)
  assert.deepEqual(orders.get('o1').eventSeqs, [1, 2])
})

test('modify, undo modify restores previous lines', () => {
  seq = 0
  const c = ev('order.created', 'o1', {number: 1, name: 'A', lines: [line('Burger')]})
  const m = ev('order.modified', 'o1', {name: 'B', lines: [line('Burger', 2)], changes: []})
  let {orders} = replay([c, m])
  assert.equal(orders.get('o1').lines[0].qty, 2)
  assert.equal(orders.get('o1').name, 'B')
  ;({orders} = replay([c, m, ev('undo', 'o1', {targetSeq: m.seq})]))
  assert.equal(orders.get('o1').lines[0].qty, 1)
  assert.equal(orders.get('o1').name, 'A')
})

test('order numbers reset per day and never reuse', () => {
  const today = Date.now()
  const yesterday = today - 86400e3
  const evs = [
    {seq: 1, type: 'order.created', payload: {number: 7}, ts: yesterday},
    {seq: 2, type: 'order.created', payload: {number: 1}, ts: today},
    {seq: 3, type: 'order.created', payload: {number: 2}, ts: today},
    {seq: 4, type: 'undo', payload: {targetSeq: 3}, ts: today}
  ]
  assert.equal(nextOrderNumber(evs, today), 3)
  assert.equal(nextOrderNumber(evs.slice(0, 1), today), 1)
})

test('recall targets the latest closing status change', () => {
  seq = 0
  const a = ev('order.created', 'a', {number: 1, lines: []})
  const b = ev('order.created', 'b', {number: 2, lines: []})
  const da = ev('status.changed', 'a', {status: 'done'})
  const db = ev('status.changed', 'b', {status: 'done'})
  assert.equal(recallTarget([a, b, da, db], DEFAULT_SETTINGS).seq, db.seq)
  const ub = ev('undo', 'b', {targetSeq: db.seq})
  assert.equal(recallTarget([a, b, da, db, ub], DEFAULT_SETTINGS).seq, da.seq)
  const withPickup = {statuses: {started: true, done: true, pickedup: true}}
  assert.equal(recallTarget([a, b, da, db], withPickup), null)
  assert.equal(isOpen(replay([a, da]).orders.get('a'), withPickup), true)
})

test('diffLines lists additions, removals, and name change', () => {
  const changes = diffLines([line('Burger', 2, ['Medium rare'])], [line('Burger', 1, ['Medium rare']), line('Fries')], 'Sam', 'Sam B')
  assert.deepEqual(changes, ['+ 1× Fries', '− 1× Burger (Medium rare)', 'Name: Sam B'])
})

test('plates group, compact, and show in change lists', async () => {
  const {groupByPlate, compactPlates, platesOf} = await import('../js/log.js')
  const lines = [
    {...line('Burger'), plate: 2},
    {...line('Water')},
    {...line('Fries'), plate: 2},
    {...line('Salad'), plate: 3}
  ]
  assert.deepEqual(groupByPlate(lines).map(g => [g.plate, g.entries.map(e => e.line.itemName)]), [
    [null, ['Water']],
    [2, ['Burger', 'Fries']],
    [3, ['Salad']]
  ])
  compactPlates(lines)
  assert.deepEqual(platesOf(lines), [1, 2])
  assert.deepEqual(lines.map(l => l.plate ?? null), [1, null, 1, 2])
  const moved = lines.map(l => (l.itemName === 'Fries' ? {...l, plate: 2} : l))
  assert.deepEqual(diffLines(lines, moved, '', ''), ['+ 1× Fries on Plate 2', '− 1× Fries on Plate 1'])
})
