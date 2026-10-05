// Head device: take an order and send it to the kitchen.

import {h, clear, sheet, sheetHeader, toast, confirmDialog} from '../ui.js'
import {state, sendOrder, modifyOrder, undoEvent} from '../store.js'
import {diffLines, groupByPlate, platesOf, compactPlates, plateLabel} from '../log.js'

// The ticket being built survives switching tabs, and is kept in localStorage
// so reloading (e.g. for an app update) doesn't lose an unsent order.
const TICKET_KEY = 'yes-chef-ticket'
export const ticket = loadTicket()

function loadTicket() {
  const empty = {name: '', lines: [], editing: null, lastPlate: null}
  try {
    return {...empty, ...JSON.parse(localStorage.getItem(TICKET_KEY))}
  } catch {
    return empty
  }
}

function saveTicket() {
  try {
    if (ticket.lines.length || ticket.name || ticket.editing) localStorage.setItem(TICKET_KEY, JSON.stringify(ticket))
    else localStorage.removeItem(TICKET_KEY)
  } catch {}
}

export function startEditing(order) {
  ticket.editing = order.id
  ticket.name = order.name
  ticket.lines = structuredClone(order.lines)
  ticket.lastPlate = null
  saveTicket()
}

function resetTicket() {
  ticket.name = ''
  ticket.lines = []
  ticket.editing = null
  ticket.lastPlate = null
  saveTicket()
}

// Plate choices: none, each plate on the ticket, or a new one.
function plateChoices() {
  const plates = platesOf(ticket.lines)
  return [{value: null, label: 'No plate'}, ...plates.map(p => ({value: p, label: plateLabel(p)})), {value: (plates.at(-1) || 0) + 1, label: '+ New plate'}]
}

export function orderView({go}) {
  const grid = h('div', {class: 'cat-grid'})
  const panel = h('aside', {class: 'ticket'})
  const el = h('div', {class: 'order-screen'}, h('section', {class: 'order-main'}, grid), panel)

  function renderGrid() {
    const menu = state.menu
    if (!menu?.categories?.length) {
      clear(grid,
        h('div', {class: 'empty'},
          h('h2', null, 'No menu yet'),
          h('p', null, 'Build a menu, or load the test menu, then publish it.'),
          h('button', {class: 'btn primary big', onclick: () => go('menu')}, 'Open menu designer')
        )
      )
      return
    }
    clear(grid, menu.categories.map(cat =>
      h('button', {class: 'cat-btn', style: {'--cat': cat.color || '#888'}, onclick: () => openCategory(cat)},
        h('span', null, cat.name),
        h('small', null, `${cat.items.length} item${cat.items.length === 1 ? '' : 's'}`)
      )
    ))
  }

  function renderTicket() {
    const editingOrder = ticket.editing && state.derived.orders.get(ticket.editing)
    const nameInput = h('input', {class: 'input big', placeholder: 'Name (optional)', value: ticket.name, oninput: e => {
      ticket.name = e.target.value
      saveTicket()
    }, 'aria-label': 'Order name'})
    clear(panel,
      editingOrder && h('div', {class: 'editing-banner'},
        h('strong', null, `Editing order #${editingOrder.number}`),
        h('button', {class: 'btn small', onclick: () => {
          resetTicket()
          renderTicket()
        }}, 'Stop editing')
      ),
      h('div', {class: 'ticket-head'}, h('h2', null, editingOrder ? 'Changes' : 'Ticket'), ticket.lines.length > 0 && h('button', {class: 'btn ghost small', onclick: async () => {
        if (await confirmDialog({title: 'Clear ticket?', confirm: 'Clear', danger: true})) {
          ticket.lines = []
          ticket.lastPlate = null
          renderTicket()
        }
      }}, 'Clear')),
      nameInput,
      h('ul', {class: 'ticket-lines'},
        ticket.lines.length === 0 && h('li', {class: 'muted pad'}, 'Tap a category to add items.'),
        groupByPlate(ticket.lines).map(({plate, entries}) => [
          plate != null && h('li', {class: 'plate-head'}, plateLabel(plate)),
          entries.map(({line, index}) =>
            h('li', {class: 'ticket-line' + (plate != null ? ' plated' : '')},
              h('div', {class: 'line-body'},
                h('div', {class: 'line-name'}, line.itemName),
                line.modifiers.length > 0 && h('div', {class: 'line-mods'}, line.modifiers.join(', ')),
                line.note && h('div', {class: 'line-note'}, `“${line.note}”`),
                h('button', {class: 'plate-pill', 'aria-label': `Plate for ${line.itemName}`, onclick: () => choosePlate(line)}, line.plate != null ? plateLabel(line.plate) : '+ Plate')
              ),
              h('div', {class: 'qty'},
                h('button', {class: 'btn icon', 'aria-label': 'Less', onclick: () => {
                  if (line.qty > 1) line.qty--
                  else {
                    ticket.lines.splice(index, 1)
                    compactPlates(ticket.lines)
                  }
                  renderTicket()
                }}, line.qty > 1 ? '−' : '🗑'),
                h('span', {class: 'qty-n'}, line.qty),
                h('button', {class: 'btn icon', 'aria-label': 'More', onclick: () => {
                  line.qty++
                  renderTicket()
                }}, '+')
              )
            )
          )
        ])
      ),
      h('button', {class: 'btn primary send', disabled: ticket.lines.length === 0, onclick: send}, editingOrder ? 'Save changes' : 'Send')
    )
    saveTicket()
  }

  function choosePlate(line) {
    sheet(close =>
      h('div', null,
        sheetHeader(`${line.itemName}: which plate?`, close),
        h('div', {class: 'chips'}, plateChoices().map(c =>
          h('button', {class: 'chip' + ((line.plate ?? null) === c.value ? ' on' : ''), onclick: () => {
            line.plate = c.value
            if (c.value != null) ticket.lastPlate = c.value
            compactPlates(ticket.lines)
            close()
            renderTicket()
          }}, c.label)
        ))
      )
    )
  }

  async function send() {
    if (!ticket.lines.length) return
    if (ticket.editing) {
      const order = state.derived.orders.get(ticket.editing)
      const changes = diffLines(order.lines, ticket.lines, order.name, ticket.name.trim())
      if (!changes.length) {
        toast('Nothing changed.')
        return
      }
      await modifyOrder(order.id, {name: ticket.name.trim(), lines: ticket.lines, changes})
      toast(`Order #${order.number} updated`)
      resetTicket()
      renderTicket()
      return
    }
    const evt = await sendOrder({name: ticket.name.trim(), lines: ticket.lines})
    resetTicket()
    renderTicket()
    toast(`Order #${evt.payload.number} sent`, {
      action: 'Undo',
      duration: 10000,
      onAction: async () => {
        await undoEvent(evt.seq)
        toast(`Order #${evt.payload.number} pulled back`)
      }
    })
  }

  function openCategory(cat) {
    sheet(close =>
      h('div', null,
        sheetHeader(cat.name, close),
        h('div', {class: 'item-grid'},
          cat.items.length === 0 && h('p', {class: 'muted'}, 'No items in this category.'),
          cat.items.map(item =>
            h('button', {class: 'item-btn', style: {'--cat': cat.color || '#888'}, onclick: () => {
              close()
              openItem(cat, item)
            }}, item.name)
          )
        )
      ),
      {wide: true}
    )
  }

  function openItem(cat, item) {
    const groups = (item.modifierGroups || []).map(id => state.menu.modifierGroups.find(g => g.id === id)).filter(Boolean)
    const picks = new Map(groups.map(g => [g.id, new Set()]))
    let qty = 1
    let note = ''
    // Keep adding to the plate used last, as long as it's still on the ticket.
    let plate = ticket.lastPlate != null && platesOf(ticket.lines).includes(ticket.lastPlate) ? ticket.lastPlate : null
    const missing = () => groups.filter(g => g.required && picks.get(g.id).size === 0)

    sheet((close, rebuild) => {
      const needs = missing()
      return h('div', null,
        sheetHeader(item.name, close),
        groups.map(g =>
          h('fieldset', {class: 'mod-group'},
            h('legend', null, g.name, h('small', null, g.required ? (g.select === 'single' ? ' · pick one' : ' · pick at least one') : g.select === 'single' ? ' · optional' : ' · any')),
            h('div', {class: 'chips'},
              g.options.map(o => {
                const on = picks.get(g.id).has(o.id)
                return h('button', {class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => {
                  const set = picks.get(g.id)
                  if (g.select === 'single') {
                    const was = set.has(o.id)
                    set.clear()
                    if (!was) set.add(o.id)
                  } else if (on) set.delete(o.id)
                  else set.add(o.id)
                  rebuild()
                }}, o.name)
              })
            )
          )
        ),
        h('div', {class: 'row gap wrap item-foot'},
          h('div', {class: 'qty big'},
            h('button', {class: 'btn icon', 'aria-label': 'Less', onclick: () => {
              qty = Math.max(1, qty - 1)
              rebuild()
            }}, '−'),
            h('span', {class: 'qty-n'}, qty),
            h('button', {class: 'btn icon', 'aria-label': 'More', onclick: () => {
              qty++
              rebuild()
            }}, '+')
          ),
          h('input', {class: 'input grow', placeholder: 'Note (optional)', value: note, oninput: e => (note = e.target.value), 'aria-label': 'Note'})
        ),
        h('fieldset', {class: 'mod-group'},
          h('legend', null, 'Plate', h('small', null, ' · optional')),
          h('div', {class: 'chips'}, plateChoices().map(c =>
            h('button', {class: 'chip' + (plate === c.value ? ' on' : ''), 'aria-pressed': String(plate === c.value), onclick: () => {
              plate = c.value
              rebuild()
            }}, c.label)
          ))
        ),
        h('button', {class: 'btn primary big full', disabled: needs.length > 0, onclick: () => {
          const modifiers = groups.flatMap(g => g.options.filter(o => picks.get(g.id).has(o.id)).map(o => o.name))
          ticket.lines.push({itemId: item.id, itemName: item.name, category: cat.name, color: cat.color, qty, modifiers, note: note.trim(), ...(plate != null ? {plate} : {})})
          ticket.lastPlate = plate
          compactPlates(ticket.lines)
          close()
          renderTicket()
        }}, needs.length ? `Choose ${needs.map(g => g.name).join(', ')}` : `Add ${qty} to ticket`)
      )
    })
  }

  renderGrid()
  renderTicket()

  let menuVersion = state.menu?.version
  return {
    el,
    update() {
      if (state.menu?.version !== menuVersion) {
        menuVersion = state.menu?.version
        renderGrid()
      }
    }
  }
}
