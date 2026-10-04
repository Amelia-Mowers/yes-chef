// Kitchen: open tickets as cards with big status buttons.

import {h, clear, toast, age} from '../ui.js'
import {state, kitchenSetStatus, recall, dismissTicket} from '../store.js'
import {enabledStatuses, isOpen, STATUS_ORDER, STATUS_LABEL} from '../log.js'

const CANCEL_VISIBLE_MS = 2 * 60 * 60 * 1000

export function kitchenView() {
  const cards = h('div', {class: 'cards'})
  const recallBtn = h('button', {class: 'btn big', onclick: doRecall}, '↶ Recall')
  const count = h('span', {class: 'count'})
  const el = h('div', {class: 'kitchen-screen'},
    h('div', {class: 'kitchen-bar'}, count, h('div', {class: 'grow'}), recallBtn),
    cards
  )
  const seen = new Set()
  let firstRender = true

  async function doRecall() {
    const ok = await recall()
    toast(ok ? 'Recalled the last finished ticket' : 'Nothing to recall')
  }

  function pendingFor(orderId) {
    return state.pending.filter(p => p.orderId === orderId)
  }

  function render() {
    const {orders, bySeq} = state.derived
    const settings = state.settings
    const statuses = enabledStatuses(settings)
    const now = Date.now()

    const open = [...orders.values()].filter(o => isOpen(o, settings))
    const cancelled = [...orders.values()].filter(o =>
      o.cancelled && !o.undone && !state.dismissed.has(o.id) &&
      now - (bySeq.get(o.cancelledSeq)?.ts || 0) < CANCEL_VISIBLE_MS &&
      o.status !== 'done' && o.status !== 'pickedup'
    )
    const list = [...open, ...cancelled].sort((a, b) => a.createdSeq - b.createdSeq)

    count.textContent = `${open.length} open`
    if (!list.length) {
      clear(cards, h('div', {class: 'empty'}, h('h2', null, 'All clear'), h('p', null, 'New tickets show up here.')))
      firstRender = false
      return
    }

    clear(cards, list.map(o => {
      const pending = pendingFor(o.id)
      const isNew = !firstRender && !seen.has(o.id)
      seen.add(o.id)
      const lastMod = o.modifiedSeq && bySeq.get(o.modifiedSeq)
      const nextStatuses = statuses.filter(s => STATUS_ORDER.indexOf(s) > STATUS_ORDER.indexOf(o.status))
      const pendingStatus = pending.find(p => p.type === 'status.changed')?.payload.status
      const mins = (now - o.createdTs) / 60000

      return h('article', {class: ['card', o.cancelled && 'cancelled', lastMod && 'modified', isNew && 'flash', mins >= 15 && 'late', mins >= 8 && mins < 15 && 'warn'].filter(Boolean).join(' ')},
        h('header', {class: 'card-head'},
          h('span', {class: 'card-num'}, `#${o.number}`),
          h('span', {class: 'card-name'}, o.name),
          h('span', {class: 'card-age', title: 'Time since sent'}, age(o.createdTs, now))
        ),
        o.cancelled && h('div', {class: 'banner cancel'}, 'CANCELLED'),
        lastMod && !o.cancelled && h('div', {class: 'banner mod'},
          h('strong', null, 'CHANGED'),
          lastMod.payload.changes?.length > 0 && h('ul', null, lastMod.payload.changes.map(c => h('li', null, c)))
        ),
        o.status !== 'new' && !o.cancelled && h('div', {class: 'status-tag s-' + o.status}, STATUS_LABEL[o.status]),
        h('ul', {class: 'card-lines'},
          o.lines.map(l =>
            h('li', {style: {'--cat': l.color || 'transparent'}},
              h('span', {class: 'card-qty'}, l.qty),
              h('div', null,
                h('div', {class: 'card-item'}, l.itemName),
                l.modifiers?.length > 0 && h('div', {class: 'card-mods'}, l.modifiers.join(' · ')),
                l.note && h('div', {class: 'card-note'}, l.note)
              )
            )
          )
        ),
        h('footer', {class: 'card-actions'},
          o.cancelled
            ? h('button', {class: 'btn big full', onclick: () => dismissTicket(o.id)}, 'Clear')
            : pendingStatus
              ? h('button', {class: 'btn big full pending', disabled: true}, `${STATUS_LABEL[pendingStatus]} · sending…`)
              : nextStatuses.map(s =>
                  h('button', {class: `btn big full status s-${s}`, onclick: () => kitchenSetStatus(o.id, s)}, STATUS_LABEL[s])
                )
        )
      )
    }))
    firstRender = false
  }

  render()
  const timer = setInterval(render, 15000)
  return {el, update: render, destroy: () => clearInterval(timer)}
}
