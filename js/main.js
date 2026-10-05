// App shell: role choice, tabs, connection badge.

import {h, clear, toast} from './ui.js'
import {state, boot, subscribe, chooseRole, pairKitchen, setHooks} from './store.js'
import {parsePairing} from './net.js'
import {applyWakeLock} from './wake.js'
import {applyTheme} from './theme.js'
import {registerServiceWorker} from './update.js'
import {announceMove} from './moved.js'
import {orderView} from './views/order.js'
import {kitchenView} from './views/kitchen.js'
import {historyView} from './views/history.js'
import {menuView} from './views/menu.js'
import {settingsView} from './views/settings.js'
import {pairView, waitingView} from './views/pair.js'

const TABS = {
  head: [
    ['order', 'Order', orderView],
    ['history', 'History', historyView],
    ['menu', 'Menu', menuView],
    ['settings', 'Settings', settingsView]
  ],
  kitchen: [
    ['tickets', 'Tickets', kitchenView],
    ['history', 'History', historyView],
    ['settings', 'Settings', settingsView]
  ]
}

const app = document.getElementById('app')
let current = null // {key, view}
let renderedRole
let renderedPaired
let tabsEl
let badgeEl
let viewEl

function go(key) {
  current?.view.destroy?.()
  const role = state.role
  let view
  if (role === 'kitchen' && !state.pairing && key === 'tickets') view = pairView()
  else if (role === 'kitchen' && key === 'tickets' && !state.headPeer && !state.events.length) view = waitingView()
  else view = TABS[role].find(t => t[0] === key)[2]({go})
  current = {key, view, waiting: view.el.classList.contains('empty')}
  clear(viewEl, view.el)
  for (const b of tabsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.key === key)
  viewEl.scrollTop = 0
}

function renderBadge() {
  if (state.role === 'head') {
    const n = state.kitchens.size
    badgeEl.className = 'badge ' + (n ? 'ok' : 'idle')
    badgeEl.textContent = n ? `${n} kitchen${n === 1 ? '' : 's'}` : 'No kitchens'
  } else if (!state.pairing) {
    badgeEl.className = 'badge idle'
    badgeEl.textContent = 'Not paired'
  } else {
    const q = state.pending.length
    badgeEl.className = 'badge ' + (state.headPeer ? 'ok' : 'bad')
    badgeEl.textContent = (state.headPeer ? 'Connected' : 'Head offline') + (q ? ` · ${q} queued` : '')
  }
}

function renderRoleChoice() {
  clear(app,
    h('main', {class: 'role-screen'},
      h('div', {class: 'brand big'}, h('img', {src: 'icons/icon.svg', alt: ''}), 'Yes Chef'),
      h('p', {class: 'muted'}, 'What is this tablet for?'),
      h('div', {class: 'role-btns'},
        h('button', {class: 'role-btn', onclick: () => chooseRole('head')}, h('strong', null, 'Head'), h('span', null, 'Take orders, design the menu')),
        h('button', {class: 'role-btn', onclick: () => chooseRole('kitchen')}, h('strong', null, 'Kitchen'), h('span', null, 'Show tickets, mark them done'))
      ),
      h('p', {class: 'muted small'}, 'Use one head tablet and any number of kitchen tablets on the same Wi-Fi.')
    )
  )
}

function renderShell() {
  const tabs = TABS[state.role]
  tabsEl = h('nav', {class: 'tabs'}, tabs.map(([key, label]) => h('button', {'data-key': key, onclick: () => go(key)}, label)))
  badgeEl = h('span', {class: 'badge'})
  viewEl = h('main', {class: 'view'})
  clear(app,
    h('header', {class: 'topbar'}, h('div', {class: 'brand'}, h('img', {src: 'icons/icon.svg', alt: ''}), 'Yes Chef'), tabsEl, badgeEl),
    viewEl
  )
  go(tabs[0][0])
}

function render() {
  if (!state.role) {
    renderedRole = null
    current?.view.destroy?.()
    current = null
    return renderRoleChoice()
  }
  const paired = Boolean(state.pairing)
  if (state.role !== renderedRole) {
    renderedRole = state.role
    renderedPaired = paired
    renderShell()
    applyWakeLock()
  } else if (paired !== renderedPaired) {
    renderedPaired = paired
    go(current.key)
  } else if (current?.waiting && (state.headPeer || state.events.length)) {
    go(current.key)
  } else current?.view.update?.(state)
  renderBadge()
}

// A pairing link opened directly (e.g. from the tablet's camera app).
function readPairingHash() {
  const parsed = parsePairing(location.hash)
  if (!parsed) return null
  history.replaceState(null, '', location.pathname + location.search)
  return parsed
}

async function start() {
  applyTheme()
  setHooks({toast: msg => toast(msg)})
  subscribe(render)
  await boot()
  const link = readPairingHash()
  if (link) {
    if (state.role === 'head') toast('This is the head device. Open the pairing link on a kitchen tablet.')
    else {
      if (!state.role) await chooseRole('kitchen')
      await pairKitchen(link)
      toast('Paired. Waiting for the head device…')
    }
  }
  render()
  announceMove()
}

registerServiceWorker()

start().catch(err => {
  console.error(err)
  clear(app, h('main', {class: 'empty'}, h('h2', null, 'Yes Chef could not start'), h('p', null, String(err.message || err))))
})
