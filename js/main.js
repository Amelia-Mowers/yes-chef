// App shell: role choice, tabs, connection badge.

import {h, clear, toast} from './ui.js'
import {state, boot, subscribe, chooseRole, pairKitchen, setHooks, isClient, switchClientRole} from './store.js'
import {parsePairing} from './net.js'
import {applyWakeLock} from './wake.js'
import {applyTheme} from './theme.js'
import {registerServiceWorker} from './update.js'
import {PLAY_PUBLIC, PLAY_URL} from './config.js'
import {inAndroidApp} from './platform.js'
import {announceMove} from './moved.js'
import {loadLicense, activateLicense, isLicensed, ENFORCE, onLicense, licenseStatus} from './license.js'
import {subscribeView} from './views/subscribe.js'
import {autoBackup, backupNow} from './cloud.js'
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
  taker: [
    ['order', 'Order', orderView],
    ['history', 'History', historyView],
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
  // Kitchens and order takers start on a pairing screen, then wait for the head's first sync.
  const firstTab = TABS[role][0][0]
  // Android app: taking orders on the head needs a subscription (kitchens and
  // order takers are free). History, menu and settings stay available.
  if (role === 'head' && key === 'order' && ENFORCE && !isLicensed()) view = subscribeView()
  else if (isClient(role) && !state.pairing && key === firstTab) view = pairView()
  else if (isClient(role) && key === firstTab && !state.headPeer && !state.events.length) view = waitingView()
  else view = TABS[role].find(t => t[0] === key)[2]({go})
  current = {key, view, waiting: view.el.classList.contains('empty')}
  clear(viewEl, view.el)
  for (const b of tabsEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.key === key)
  viewEl.scrollTop = 0
}

function renderBadge() {
  if (state.role === 'head') {
    const n = state.devices.size
    badgeEl.className = 'badge ' + (n ? 'ok' : 'idle')
    badgeEl.textContent = n ? `${n} device${n === 1 ? '' : 's'}` : 'No devices'
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
        h('button', {class: 'role-btn', onclick: () => chooseRole('kitchen')}, h('strong', null, 'Kitchen'), h('span', null, 'Show tickets, mark them done')),
        h('button', {class: 'role-btn', onclick: () => chooseRole('taker')}, h('strong', null, 'Order taker'), h('span', null, 'Take orders and send them through the head'))
      ),
      h('p', {class: 'muted small'}, 'Use one head tablet, plus any number of kitchen and order-taker tablets on the same Wi-Fi.')
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

// A pairing link (the head's QR code) opened from the camera app. With the
// Android app installed, Android opens it in the app. A new tablet pairs as a
// kitchen straight away, then gets a banner to switch to order taker (and, in
// an Android browser, a note about the app).
function showPairedBanner() {
  const androidBrowser = /Android/i.test(navigator.userAgent) && !inAndroidApp()
  const banner = h('div', {class: 'update-banner paired', role: 'status'},
    h('span', null, 'Paired as a kitchen.'),
    androidBrowser && h('span', {class: 'small'}, PLAY_PUBLIC ? 'Tip: the free Android app works best.' : 'The Android app is still in testing; the browser works just as well.'),
    androidBrowser && PLAY_PUBLIC && h('a', {class: 'btn small', href: PLAY_URL}, 'Get the app'),
    h('button', {class: 'btn small', onclick: async () => {
      banner.remove()
      await switchClientRole('taker')
      toast('This tablet is now an order taker.')
    }}, 'Make this an order taker'),
    h('button', {class: 'btn primary small', onclick: () => banner.remove()}, 'OK')
  )
  document.body.append(banner)
}

function readPairingHash() {
  const parsed = parsePairing(location.hash)
  if (!parsed) return null
  history.replaceState(null, '', location.pathname + location.search)
  return parsed
}

async function start() {
  applyTheme()
  setHooks({
    toast: msg => toast(msg),
    snapshot: reason => isLicensed() && backupNow(reason.toLowerCase()).catch(() => {})
  })
  subscribe(render)
  await boot()
  const link = readPairingHash()
  if (link) {
    if (state.role === 'head') toast('This is the head device. Open the pairing link on a kitchen or order-taker tablet.')
    else {
      const fresh = !state.role
      if (fresh) await chooseRole('kitchen')
      await pairKitchen(link)
      if (fresh) showPairedBanner()
      else toast('Paired. Waiting for the head device…')
    }
  }
  render()
  announceMove()
  if (state.role === 'head') loadLicense().then(autoBackup)
  // Swap the order screen and the subscription screen as the license changes.
  let licensed = isLicensed()
  onLicense(() => {
    if (isLicensed() !== licensed && state.role === 'head' && current?.key === 'order') go('order')
    licensed = isLicensed()
    if (ENFORCE && licenseStatus() === 'grace') toast('Yes Chef couldn’t check your subscription lately. Connect to the internet within a few days to keep taking orders.', {duration: 8000})
  })
  // Local development only: lets tests activate a fake purchase.
  if (location.hostname === 'localhost') window.__yesChef = {activateLicense}
}

registerServiceWorker()

start().catch(err => {
  console.error(err)
  clear(app, h('main', {class: 'empty'}, h('h2', null, 'Yes Chef could not start'), h('p', null, String(err.message || err))))
})
