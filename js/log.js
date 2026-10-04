// Pure event-log logic: undo resolution and replay into current state.
// Shared by the head device (which owns the log) and kitchens (which mirror it).

export const STATUS_ORDER = ['new', 'started', 'done', 'pickedup']
export const STATUS_LABEL = {new: 'New', started: 'Started', done: 'Done', pickedup: 'Picked up'}
export const UNDOABLE = new Set(['order.created', 'order.modified', 'order.cancelled', 'status.changed', 'undo'])

export const DEFAULT_SETTINGS = {statuses: {started: false, done: true, pickedup: false}}

// Statuses a kitchen can tap, in order. Done is always on.
export function enabledStatuses(settings) {
  const s = settings?.statuses || DEFAULT_SETTINGS.statuses
  return STATUS_ORDER.filter(k => k === 'done' || (k !== 'new' && s[k]))
}

// The status that takes a ticket off the kitchen screen.
export function closingStatus(settings) {
  const list = enabledStatuses(settings)
  return list[list.length - 1]
}

export function isOpen(order, settings) {
  if (!order || order.cancelled || order.undone) return false
  const closing = closingStatus(settings)
  return STATUS_ORDER.indexOf(order.status) < STATUS_ORDER.indexOf(closing)
}

// Which events are currently undone. An undo is itself undoable (redo),
// so an event is undone when at least one active undo targets it.
export function undoneSet(events) {
  const undosByTarget = new Map()
  for (const e of events) {
    if (e.type !== 'undo') continue
    const t = e.payload?.targetSeq
    if (!undosByTarget.has(t)) undosByTarget.set(t, [])
    undosByTarget.get(t).push(e.seq)
  }
  const memo = new Map()
  const isUndone = seq => {
    if (memo.has(seq)) return memo.get(seq)
    memo.set(seq, false) // cycle guard; targets always point backwards anyway
    const undos = undosByTarget.get(seq) || []
    const result = undos.some(u => !isUndone(u))
    memo.set(seq, result)
    return result
  }
  const out = new Set()
  for (const e of events) if (isUndone(e.seq)) out.add(e.seq)
  return out
}

// Replay the log into orders. Returns {orders: Map, undone: Set, bySeq: Map}.
export function replay(events) {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const undone = undoneSet(sorted)
  const orders = new Map()
  const bySeq = new Map()

  for (const e of sorted) {
    bySeq.set(e.seq, e)
    if (e.type === 'order.created') {
      // Orders whose creation was undone still exist (greyed out in history).
      orders.set(e.orderId, {
        id: e.orderId,
        number: e.payload.number,
        name: e.payload.name || '',
        lines: e.payload.lines || [],
        status: 'new',
        cancelled: false,
        undone: undone.has(e.seq),
        createdSeq: e.seq,
        createdTs: e.ts,
        updatedSeq: e.seq,
        updatedTs: e.ts,
        modifiedSeq: null,
        statusSeq: null,
        eventSeqs: [e.seq]
      })
      continue
    }
    const order = e.orderId && orders.get(e.orderId)
    if (order) order.eventSeqs.push(e.seq)
    if (undone.has(e.seq) || !order || order.undone) continue

    if (e.type === 'order.modified') {
      order.name = e.payload.name ?? order.name
      order.lines = e.payload.lines ?? order.lines
      order.modifiedSeq = e.seq
    } else if (e.type === 'order.cancelled') {
      order.cancelled = true
      order.cancelledSeq = e.seq
    } else if (e.type === 'status.changed') {
      order.status = e.payload.status
      order.statusSeq = e.seq
      order.statusTs = e.ts
    } else continue
    order.updatedSeq = e.seq
    order.updatedTs = e.ts
  }

  // Undo events attach to the order of their target so timelines show them.
  for (const e of sorted) {
    if (e.type !== 'undo') continue
    const target = bySeq.get(e.payload?.targetSeq)
    const orderId = target?.orderId || bySeq.get(target?.payload?.targetSeq)?.orderId
    const order = orderId && orders.get(orderId)
    if (order && !order.eventSeqs.includes(e.seq)) {
      order.eventSeqs.push(e.seq)
      order.eventSeqs.sort((a, b) => a - b)
    }
  }

  return {orders, undone, bySeq}
}

// Next order number: counts up per local day, never reusing a number that day.
export function nextOrderNumber(events, now = Date.now()) {
  const day = new Date(now).toDateString()
  let max = 0
  for (const e of events) {
    if (e.type === 'order.created' && new Date(e.ts).toDateString() === day) max = Math.max(max, e.payload.number || 0)
  }
  return max + 1
}

// Most recent active status change that closed a ticket (kitchen Recall target).
export function recallTarget(events, settings) {
  const closing = closingStatus(settings)
  const {orders, undone} = replay(events)
  const sorted = [...events].sort((a, b) => b.seq - a.seq)
  for (const e of sorted) {
    if (e.type !== 'status.changed' || undone.has(e.seq) || e.payload.status !== closing) continue
    const order = orders.get(e.orderId)
    if (order && !order.cancelled && !order.undone && order.statusSeq === e.seq) return e
  }
  return null
}

export function lineText(line) {
  const mods = line.modifiers?.length ? ` (${line.modifiers.join(', ')})` : ''
  return `${line.qty}× ${line.itemName}${mods}`
}

// Human-readable changes between two sets of order lines.
export function diffLines(before, after, nameBefore, nameAfter) {
  const key = l => `${l.itemName}|${(l.modifiers || []).join(',')}|${l.note || ''}`
  const count = lines => {
    const m = new Map()
    for (const l of lines) m.set(key(l), {line: l, qty: (m.get(key(l))?.qty || 0) + l.qty})
    return m
  }
  const a = count(before)
  const b = count(after)
  const changes = []
  for (const [k, {line, qty}] of b) {
    const prev = a.get(k)?.qty || 0
    if (qty > prev) changes.push(`+ ${lineText({...line, qty: qty - prev})}`)
  }
  for (const [k, {line, qty}] of a) {
    const next = b.get(k)?.qty || 0
    if (qty > next) changes.push(`− ${lineText({...line, qty: qty - next})}`)
  }
  if ((nameBefore || '') !== (nameAfter || '')) changes.push(`Name: ${nameAfter || '(none)'}`)
  return changes
}

export function describeEvent(e, bySeq) {
  switch (e.type) {
    case 'order.created':
      return `Order #${e.payload.number} sent`
    case 'order.modified':
      return `Modified${e.payload.changes?.length ? ': ' + e.payload.changes.join('; ') : ''}`
    case 'order.cancelled':
      return 'Cancelled'
    case 'status.changed':
      return `Marked ${STATUS_LABEL[e.payload.status] || e.payload.status}`
    case 'undo': {
      const t = bySeq?.get(e.payload.targetSeq)
      return `Undo: ${t ? describeEvent(t, bySeq) : '#' + e.payload.targetSeq}`
    }
    case 'menu.published':
      return `Menu v${e.payload.version} published`
    case 'settings.changed':
      return 'Settings changed'
    default:
      return e.type
  }
}
