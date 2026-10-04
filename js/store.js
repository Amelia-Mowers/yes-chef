// App state for both roles. The head device owns the event log and assigns
// `seq`; kitchens mirror it and send intents that the head turns into events.

import {kv, events as eventsDb, backups, requestPersistence} from './db.js'
import {connect, randomCode, ROOM_LEN, SECRET_LEN} from './net.js'
import {replay, nextOrderNumber, DEFAULT_SETTINGS, UNDOABLE, recallTarget, closingStatus} from './log.js'

const listeners = new Set()

export const state = {
  role: null, // 'head' | 'kitchen'
  deviceId: null,
  events: [],
  derived: replay([]),
  menu: null, // published menu
  menuDraft: null, // head only: menu being edited
  settings: DEFAULT_SETTINGS,
  epoch: null, // changes when the log is cleared or replaced
  // head
  room: null,
  secret: null,
  kitchens: new Map(), // peerId → {deviceId, name}
  // kitchen
  pairing: null, // {room, secret, name}
  headPeer: null,
  pending: [], // queued intents not yet confirmed by the head
  dismissed: new Set(), // cancelled tickets cleared from this kitchen's screen
  // device-local
  local: {wakeLock: null}
}

let net = null

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  for (const fn of listeners) fn(state)
}

function rederive() {
  state.derived = replay(state.events)
}

const uid = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`

export const lastSeq = () => (state.events.length ? state.events[state.events.length - 1].seq : 0)

// ---------- boot ----------

export async function boot() {
  requestPersistence()
  state.deviceId = (await kv.get('deviceId')) || uid('dev')
  await kv.set('deviceId', state.deviceId)
  state.role = await kv.get('role')
  state.local = {wakeLock: null, ...(await kv.get('local'))}
  state.events = (await eventsDb.all()).sort((a, b) => a.seq - b.seq)
  state.menu = (await kv.get('menu')) || null
  state.settings = (await kv.get('settings')) || DEFAULT_SETTINGS
  state.epoch = (await kv.get('epoch')) || null
  rederive()
  if (state.role === 'head') await startHead()
  else if (state.role === 'kitchen') await startKitchen()
  emit()
}

export async function chooseRole(role) {
  state.role = role
  await kv.set('role', role)
  if (role === 'head') await startHead()
  else await startKitchen()
  emit()
}

export async function resetRole() {
  await net?.leave()
  net = null
  state.role = null
  state.headPeer = null
  state.kitchens.clear()
  await kv.del('role')
  emit()
}

export async function setLocal(patch) {
  state.local = {...state.local, ...patch}
  await kv.set('local', state.local)
  emit()
}

// ---------- head ----------

async function startHead() {
  state.menuDraft = (await kv.get('menuDraft')) || state.menu || emptyMenu()
  state.room = await kv.get('room')
  state.secret = await kv.get('secret')
  if (!state.room || !state.secret) {
    state.room = randomCode(ROOM_LEN)
    state.secret = randomCode(SECRET_LEN)
    await kv.set('room', state.room)
    await kv.set('secret', state.secret)
  }
  if (!state.epoch) await newEpoch()
  await headConnect()
}

async function newEpoch() {
  state.epoch = uid('ep')
  await kv.set('epoch', state.epoch)
}

async function headConnect() {
  await net?.leave()
  state.kitchens.clear()
  net = await connect({
    room: state.room,
    secret: state.secret,
    onPeerJoin: peerId => net.send('head', {epoch: state.epoch}, peerId),
    onPeerLeave: peerId => {
      state.kitchens.delete(peerId)
      emit()
    },
    handlers: {
      hello: (d, peerId) => {
        state.kitchens.set(peerId, {deviceId: d.deviceId, name: d.name || 'Kitchen'})
        emit()
        sendSync(peerId, d.epoch === state.epoch ? d.lastSeq : 0)
      },
      intent: (d, peerId) => handleIntent(d, peerId)
    }
  })
  emit()
}

function sendSync(peerId, afterSeq) {
  const full = afterSeq === 0
  net?.send(
    'sync',
    {
      epoch: state.epoch,
      full,
      menu: state.menu,
      settings: state.settings,
      events: state.events.filter(e => e.seq > afterSeq)
    },
    peerId
  )
}

function broadcastFullSync() {
  for (const peerId of net?.peers || []) sendSync(peerId, 0)
}

// Appends are serialized so every event gets the next seq exactly once.
let appendChain = Promise.resolve()

function append(partial) {
  const run = async () => {
    const evt = {
      seq: lastSeq() + 1,
      id: uid('evt'),
      type: partial.type,
      orderId: partial.orderId || null,
      payload: partial.payload || {},
      device: partial.device || state.deviceId,
      ts: Date.now(),
      ...(partial.intentId ? {intentId: partial.intentId} : {})
    }
    await eventsDb.put(evt)
    state.events.push(evt)
    rederive()
    net?.send('evt', {epoch: state.epoch, event: evt})
    emit()
    return evt
  }
  const p = appendChain.then(run)
  appendChain = p.catch(() => {})
  return p
}

async function handleIntent(intent, peerId) {
  const existing = state.events.find(e => e.intentId === intent.intentId)
  if (existing) {
    // Duplicate (the kitchen resent before seeing our event): echo it back.
    net?.send('evt', {epoch: state.epoch, event: existing}, peerId)
    return
  }
  const device = state.kitchens.get(peerId)?.deviceId || peerId
  const {orders, undone} = state.derived
  if (intent.type === 'status.changed') {
    const order = orders.get(intent.orderId)
    if (!order || order.undone || order.cancelled) return rejectIntent(intent, peerId, 'Order is no longer active')
    await append({type: 'status.changed', orderId: intent.orderId, payload: {status: intent.payload.status, from: order.status}, device, intentId: intent.intentId})
  } else if (intent.type === 'undo') {
    const target = state.derived.bySeq.get(intent.payload.targetSeq)
    if (!target || !UNDOABLE.has(target.type) || undone.has(target.seq)) return rejectIntent(intent, peerId, 'Nothing to undo')
    await append({type: 'undo', orderId: target.orderId, payload: {targetSeq: target.seq}, device, intentId: intent.intentId})
  } else rejectIntent(intent, peerId, 'Unknown request')
}

function rejectIntent(intent, peerId, reason) {
  net?.send('reject', {intentId: intent.intentId, reason}, peerId)
}

export async function sendOrder({name, lines}) {
  const orderId = uid('ord')
  return append({type: 'order.created', orderId, payload: {number: nextOrderNumber(state.events), name, lines}})
}

export async function modifyOrder(orderId, {name, lines, changes}) {
  return append({type: 'order.modified', orderId, payload: {name, lines, changes}})
}

export async function cancelOrder(orderId) {
  return append({type: 'order.cancelled', orderId})
}

export async function headSetStatus(orderId, status) {
  const order = state.derived.orders.get(orderId)
  return append({type: 'status.changed', orderId, payload: {status, from: order?.status}})
}

export async function undoEvent(targetSeq) {
  const target = state.derived.bySeq.get(targetSeq)
  if (!target || !UNDOABLE.has(target.type)) return
  if (state.role === 'kitchen') return queueIntent({type: 'undo', orderId: target.orderId, payload: {targetSeq}})
  return append({type: 'undo', orderId: target.orderId, payload: {targetSeq}})
}

export async function saveDraft(draft) {
  state.menuDraft = draft
  await kv.set('menuDraft', draft)
  emit()
}

async function snapshot(reason) {
  await backups.add({ts: Date.now(), reason, menu: state.menu, menuDraft: state.menuDraft, settings: state.settings, events: state.events, epoch: state.epoch})
}

export async function publishMenu() {
  await snapshot('Before publish')
  const version = (state.menu?.version || 0) + 1
  state.menu = {...structuredClone(state.menuDraft), version}
  state.menuDraft = structuredClone(state.menu)
  await kv.set('menu', state.menu)
  await kv.set('menuDraft', state.menuDraft)
  net?.send('menu', {menu: state.menu})
  await append({type: 'menu.published', payload: {version, categories: state.menu.categories.length}})
}

export async function changeSettings(settings) {
  state.settings = settings
  await kv.set('settings', settings)
  await append({type: 'settings.changed', payload: {settings}})
}

export async function regenerateRoom() {
  state.room = randomCode(ROOM_LEN)
  state.secret = randomCode(SECRET_LEN)
  await kv.set('room', state.room)
  await kv.set('secret', state.secret)
  await headConnect()
}

export function exportAll() {
  return {app: 'yes-chef', kind: 'backup', exportedAt: new Date().toISOString(), menu: state.menu, settings: state.settings, events: state.events}
}

export function exportMenu() {
  return state.menu || state.menuDraft
}

// Replaces menu, settings and log with an imported full backup.
export async function importAll(data) {
  await snapshot('Before import')
  state.menu = data.menu || null
  state.menuDraft = structuredClone(state.menu) || emptyMenu()
  state.settings = data.settings || DEFAULT_SETTINGS
  state.events = [...(data.events || [])].sort((a, b) => a.seq - b.seq)
  await kv.set('menu', state.menu)
  await kv.set('menuDraft', state.menuDraft)
  await kv.set('settings', state.settings)
  await eventsDb.replaceAll(state.events)
  await newEpoch()
  rederive()
  broadcastFullSync()
  emit()
}

// Loads an imported menu into the designer draft (publish to make it live).
export async function importMenuToDraft(menu) {
  await snapshot('Before import')
  await saveDraft(menu)
}

export async function clearHistory() {
  await snapshot('Before clearing history')
  state.events = []
  await eventsDb.clear()
  await newEpoch()
  rederive()
  broadcastFullSync()
  emit()
}

export async function listBackups() {
  return backups.all()
}

export async function restoreBackup(id, everything) {
  const b = await backups.get(id)
  if (!b) return
  if (everything) return importAll(b)
  await snapshot('Before restore')
  await saveDraft(structuredClone(b.menu || b.menuDraft || emptyMenu()))
}

export function hasData() {
  return Boolean(state.menu?.categories?.length || state.menuDraft?.categories?.length || state.events.length)
}

export function emptyMenu() {
  return {version: 0, categories: [], modifierGroups: []}
}

// ---------- kitchen ----------

async function startKitchen() {
  state.pairing = (await kv.get('pairing')) || null
  state.pending = (await kv.get('pending')) || []
  state.dismissed = new Set((await kv.get('dismissed')) || [])
  if (state.pairing) await kitchenConnect()
}

export async function pairKitchen({room, secret}, name) {
  const sameRoom = state.pairing?.room === room
  state.pairing = {room, secret, name: name || state.pairing?.name || 'Kitchen'}
  await kv.set('pairing', state.pairing)
  if (!sameRoom) await resetMirror()
  await kitchenConnect()
}

export async function unpairKitchen() {
  await net?.leave()
  net = null
  state.pairing = null
  state.headPeer = null
  await kv.del('pairing')
  await resetMirror()
  emit()
}

export async function renameKitchen(name) {
  state.pairing = {...state.pairing, name}
  await kv.set('pairing', state.pairing)
  if (state.headPeer) sayHello(state.headPeer)
  emit()
}

async function resetMirror() {
  state.events = []
  state.epoch = null
  state.pending = []
  await eventsDb.clear()
  await kv.del('epoch')
  await kv.set('pending', [])
  rederive()
}

function sayHello(peerId) {
  net?.send('hello', {deviceId: state.deviceId, name: state.pairing?.name, lastSeq: lastSeq(), epoch: state.epoch}, peerId)
}

let resendTimer = null

async function kitchenConnect() {
  await net?.leave()
  state.headPeer = null
  const {room, secret} = state.pairing
  net = await connect({
    room,
    secret,
    onPeerJoin: peerId => sayHello(peerId),
    onPeerLeave: peerId => {
      if (peerId === state.headPeer) {
        state.headPeer = null
        emit()
      }
    },
    handlers: {
      head: (_d, peerId) => sayHello(peerId),
      sync: (d, peerId) => applySync(d, peerId),
      evt: (d, peerId) => applyEvent(d, peerId),
      menu: async d => {
        state.menu = d.menu
        await kv.set('menu', d.menu)
        emit()
      },
      reject: async d => {
        await dropPending(d.intentId)
        toastHook?.(`Head device declined: ${d.reason}`)
      }
    }
  })
  clearInterval(resendTimer)
  resendTimer = setInterval(resendPending, 3000)
  emit()
}

async function applySync(d, peerId) {
  state.headPeer = peerId
  if (d.full || d.epoch !== state.epoch) {
    state.events = d.events
    await eventsDb.replaceAll(d.events)
    if (d.epoch !== state.epoch) {
      // The head's log was replaced; queued intents refer to the old one.
      state.pending = []
      await kv.set('pending', [])
    }
  } else if (d.events.length) {
    const have = new Set(state.events.map(e => e.seq))
    const fresh = d.events.filter(e => !have.has(e.seq))
    state.events = [...state.events, ...fresh].sort((a, b) => a.seq - b.seq)
    await eventsDb.putMany(fresh)
  }
  state.epoch = d.epoch
  state.menu = d.menu
  state.settings = d.settings || DEFAULT_SETTINGS
  await kv.set('epoch', d.epoch)
  await kv.set('menu', d.menu)
  await kv.set('settings', state.settings)
  await confirmPending()
  rederive()
  emit()
  resendPending()
}

async function applyEvent({epoch, event}, peerId) {
  if (epoch !== state.epoch) return sayHello(peerId)
  state.headPeer = peerId
  if (state.events.some(e => e.seq === event.seq)) return confirmPending().then(emit)
  if (event.seq !== lastSeq() + 1) return sayHello(peerId) // gap: ask for what we missed
  state.events.push(event)
  await eventsDb.put(event)
  if (event.type === 'settings.changed') {
    state.settings = event.payload.settings
    await kv.set('settings', state.settings)
  }
  await confirmPending()
  rederive()
  newEventHook?.(event)
  emit()
}

async function confirmPending() {
  const seen = new Set(state.events.map(e => e.intentId).filter(Boolean))
  const before = state.pending.length
  state.pending = state.pending.filter(p => !seen.has(p.intentId))
  if (state.pending.length !== before) await kv.set('pending', state.pending)
}

async function dropPending(intentId) {
  state.pending = state.pending.filter(p => p.intentId !== intentId)
  await kv.set('pending', state.pending)
  emit()
}

async function queueIntent(intent) {
  const full = {...intent, intentId: uid('int')}
  state.pending.push(full)
  await kv.set('pending', state.pending)
  emit()
  if (state.headPeer) net?.send('intent', full, state.headPeer)
}

function resendPending() {
  if (!state.headPeer) return
  for (const p of state.pending) net?.send('intent', p, state.headPeer)
}

export async function kitchenSetStatus(orderId, status) {
  if (state.role === 'head') return headSetStatus(orderId, status)
  return queueIntent({type: 'status.changed', orderId, payload: {status}})
}

export async function recall() {
  const target = recallTarget(state.events, state.settings)
  if (!target) return false
  await undoEvent(target.seq)
  return true
}

export async function dismissTicket(orderId) {
  state.dismissed.add(orderId)
  await kv.set('dismissed', [...state.dismissed])
  emit()
}

// Rejoin the room after the tablet wakes, since WebRTC often drops in the background.
let wakeCheck = null
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  clearTimeout(wakeCheck)
  wakeCheck = setTimeout(() => {
    if (state.role === 'kitchen' && state.pairing && !state.headPeer) kitchenConnect()
  }, 4000)
})

// Hooks the UI sets for toasts and alerts.
let toastHook = null
let newEventHook = null
export function setHooks({toast, newEvent}) {
  toastHook = toast
  newEventHook = newEvent
}

export {closingStatus}
