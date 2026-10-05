// History for both roles, read from the event log.

import {h, clear, sheet, sheetHeader, confirmDialog, toast, clock, dayLabel} from '../ui.js'
import {state, subscribe, undoEvent, cancelOrder, headSetStatus, kitchenSetStatus, isClient} from '../store.js'
import {STATUS_LABEL, UNDOABLE, describeEvent, enabledStatuses, lineText, groupByPlate, plateLabel} from '../log.js'
import {startEditing} from './order.js'

const filters = {status: 'all', time: 'today', name: '', mode: 'orders'}

const STATUS_FILTERS = [
  ['all', 'All'],
  ['open', 'Open'],
  ['started', 'Started'],
  ['done', 'Done'],
  ['pickedup', 'Picked up'],
  ['cancelled', 'Cancelled']
]

const TIME_FILTERS = [
  ['hour', 'Last hour'],
  ['today', 'Today'],
  ['week', '7 days'],
  ['all', 'All time']
]

function inTime(ts) {
  const now = Date.now()
  if (filters.time === 'hour') return now - ts < 3600e3
  if (filters.time === 'today') return new Date(ts).toDateString() === new Date(now).toDateString()
  if (filters.time === 'week') return now - ts < 7 * 86400e3
  return true
}

function orderStatus(o) {
  if (o.undone) return 'undone'
  if (o.cancelled) return 'cancelled'
  return o.status
}

function statusText(o) {
  const s = orderStatus(o)
  if (s === 'undone') return 'Undone'
  if (s === 'cancelled') return 'Cancelled'
  return STATUS_LABEL[s]
}

function matches(o) {
  const s = orderStatus(o)
  if (filters.status === 'open' && !(s === 'new' || s === 'started')) return false
  if (!['all', 'open'].includes(filters.status) && s !== filters.status) return false
  if (!inTime(o.createdTs)) return false
  if (filters.name && !(o.name || '').toLowerCase().includes(filters.name.toLowerCase()) && String(o.number) !== filters.name.trim()) return false
  return true
}

// The active undo that targets `seq`, if any (undoing it is a redo).
function activeUndoOf(seq) {
  const {undone} = state.derived
  return state.events.find(e => e.type === 'undo' && e.payload.targetSeq === seq && !undone.has(e.seq))
}

function deviceLabel(id) {
  if (id === state.deviceId) return 'this device'
  for (const d of state.devices.values()) if (d.deviceId === id) return d.name
  if (state.role === 'head') return 'a paired device'
  return id === state.headDeviceId ? 'head' : 'another device'
}

export function historyView({go}) {
  const list = h('div', {class: 'history-list'})
  const bar = h('div', {class: 'filters'})
  const el = h('div', {class: 'history-screen'}, bar, list)

  function renderBar() {
    const seg = (options, key) =>
      h('div', {class: 'seg'}, options.map(([v, label]) =>
        h('button', {class: 'seg-btn' + (filters[key] === v ? ' on' : ''), onclick: () => {
          filters[key] = v
          renderBar()
          renderList()
        }}, label)
      ))
    clear(bar,
      seg([['orders', 'Orders'], ['events', 'Event log']], 'mode'),
      filters.mode === 'orders' && seg(STATUS_FILTERS, 'status'),
      seg(TIME_FILTERS, 'time'),
      filters.mode === 'orders' && h('input', {class: 'input', type: 'search', placeholder: 'Name or #', value: filters.name, 'aria-label': 'Filter by name', oninput: e => {
        filters.name = e.target.value
        renderList()
      }})
    )
  }

  function renderList() {
    if (filters.mode === 'events') return renderEvents()
    const orders = [...state.derived.orders.values()].filter(matches).sort((a, b) => b.createdSeq - a.createdSeq)
    if (!orders.length) {
      clear(list, h('div', {class: 'empty'}, h('p', null, 'No orders match these filters.')))
      return
    }
    let lastDay = null
    clear(list, orders.map(o => {
      const day = dayLabel(o.createdTs)
      const header = day !== lastDay && h('h3', {class: 'day'}, day)
      lastDay = day
      return [
        header,
        h('button', {class: 'hist-row' + (o.undone ? ' undone' : ''), onclick: () => openOrder(o.id)},
          h('span', {class: 'hist-num'}, `#${o.number}`),
          h('span', {class: 'hist-main'},
            h('span', {class: 'hist-name'}, o.name || h('span', {class: 'muted'}, 'No name')),
            h('span', {class: 'hist-lines'}, o.lines.map(lineText).join(' · '))
          ),
          h('span', {class: 'hist-time'}, clock(o.createdTs)),
          h('span', {class: `pill s-${orderStatus(o)}`}, statusText(o))
        )
      ]
    }))
  }

  function renderEvents() {
    const {undone, bySeq, orders} = state.derived
    const evts = state.events.filter(e => inTime(e.ts)).slice().reverse()
    if (!evts.length) {
      clear(list, h('div', {class: 'empty'}, h('p', null, 'No events in this time range.')))
      return
    }
    clear(list, h('ol', {class: 'timeline'}, evts.map(e => {
      const order = e.orderId && orders.get(e.orderId)
      return h('li', {class: undone.has(e.seq) ? 'undone' : ''},
        h('span', {class: 'tl-seq'}, e.seq),
        h('span', {class: 'tl-time'}, clock(e.ts)),
        h('span', {class: 'tl-desc'}, order ? `#${order.number} · ` : '', describeEvent(e, bySeq)),
        h('span', {class: 'tl-dev muted'}, deviceLabel(e.device))
      )
    })))
  }

  function openOrder(orderId) {
    let unsub = null
    const s = sheet((close, rebuild) => {
      const o = state.derived.orders.get(orderId)
      const {undone, bySeq} = state.derived
      const isHead = state.role === 'head'
      const active = !o.undone && !o.cancelled
      const statuses = enabledStatuses(state.settings)
      // The head and order takers can change orders; kitchens only move statuses.
      const canEdit = state.role !== 'kitchen'
      const setStatus = isHead ? headSetStatus : kitchenSetStatus

      return h('div', null,
        sheetHeader(`Order #${o.number}${o.name ? ' · ' + o.name : ''}`, close, h('span', {class: `pill s-${orderStatus(o)}`}, statusText(o))),
        groupByPlate(o.lines).map(({plate, entries}) => [
          plate != null && h('h4', {class: 'plate-head'}, plateLabel(plate)),
          h('ul', {class: 'detail-lines'}, entries.map(({line: l}) => h('li', null, lineText(l), l.note && h('span', {class: 'line-note'}, ` “${l.note}”`))))
        ]),
        active && h('div', {class: 'row gap wrap'},
          canEdit && h('button', {class: 'btn primary', onclick: () => {
            startEditing(o)
            close()
            go('order')
          }}, 'Modify'),
          canEdit && h('button', {class: 'btn danger', onclick: async () => {
            if (await confirmDialog({title: `Cancel order #${o.number}?`, message: 'The kitchen will see it marked cancelled. You can undo this from the timeline.', confirm: 'Cancel order', cancel: 'Keep', danger: true})) {
              await cancelOrder(o.id)
              toast(`Order #${o.number} cancelled`)
              rebuild()
            }
          }}, 'Cancel order'),
          statuses.filter(s => s !== o.status).map(s =>
            h('button', {class: 'btn', onclick: async () => {
              await setStatus(o.id, s)
              rebuild()
            }}, `Mark ${STATUS_LABEL[s]}`)
          )
        ),
        h('h3', null, 'Timeline'),
        h('ol', {class: 'timeline'}, o.eventSeqs.map(seq => {
          const e = bySeq.get(seq)
          const isUndone = undone.has(seq)
          const canAct = UNDOABLE.has(e.type) && (canEdit || e.type !== 'order.created')
          const redoVia = isUndone && activeUndoOf(seq)
          return h('li', {class: isUndone ? 'undone' : ''},
            h('span', {class: 'tl-time'}, clock(e.ts)),
            h('span', {class: 'tl-desc'}, describeEvent(e, bySeq)),
            h('span', {class: 'tl-dev muted'}, deviceLabel(e.device)),
            canAct && !isUndone && h('button', {class: 'btn small', onclick: async () => {
              await undoEvent(seq)
              rebuild()
            }}, 'Undo'),
            canAct && redoVia && h('button', {class: 'btn small', onclick: async () => {
              await undoEvent(redoVia.seq)
              rebuild()
            }}, 'Redo')
          )
        })),
        isClient() && state.pending.length > 0 && h('p', {class: 'muted'}, 'Some changes are waiting for the head device.')
      )
    }, {wide: true, onClose: () => unsub?.()})
    // Keep the timeline live while it is open (kitchen changes land asynchronously).
    unsub = subscribe(() => s.rebuild())
  }

  renderBar()
  renderList()
  return {el, update: renderList}
}
