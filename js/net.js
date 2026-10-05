// Peer-to-peer transport. Trystero handles signaling and WebRTC data channels;
// every payload is additionally AES-GCM encrypted with a key derived from the
// pairing secret. Signaling goes through Yes Chef's own relay when it's
// reachable, otherwise through public Nostr relays.

import {joinRoom as joinNostr} from '../vendor/trystero.js'
import {joinRoom as joinRelay} from '../vendor/trystero-relay.js'

const APP_ID = 'yes-chef-pos-v1'
const enc = new TextEncoder()
const dec = new TextDecoder()

async function deriveKey(secret, room) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt: enc.encode('yes-chef:' + room), iterations: 100000, hash: 'SHA-256'},
    base,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt']
  )
}

const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))

function toB64Large(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// Which relay to use from this address. Every device of a restaurant runs the
// same build at the same address, so they make the same choice.
export function relayUrl(loc = location) {
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') return 'ws://localhost:8788'
  if (loc.hostname === 'app.yes-chef.win' || loc.hostname.endsWith('.github.io')) return 'wss://relay.yes-chef.win'
  return null
}

async function relayReachable(url, timeoutMs = 4000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url.replace(/^ws/, 'http') + '/health', {signal: ctrl.signal, cache: 'no-store'})
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// How this device is signaling: 'relay', 'public', or 'relay+public' (the head).
export let via = null

// Creates a connection to the room. `handlers` maps message type → fn(data, peerId).
// With `both` (the head), it listens on our relay AND the public relays, so it
// meets kitchens on older builds or on networks that can't reach our relay;
// each device reaches it through exactly one of them.
export async function connect({room, secret, onPeerJoin, onPeerLeave, handlers, both = false}) {
  const key = await deriveKey(secret, room)
  const relay = relayUrl()
  const useRelay = Boolean(relay && (await relayReachable(relay)))
  const lanes = []
  if (useRelay) lanes.push(joinRelay({appId: APP_ID, password: secret, relayConfig: {urls: [`${relay}/r/${room}`]}}, room))
  if (!useRelay || both) lanes.push(joinNostr({appId: APP_ID, password: secret}, room))
  via = useRelay ? (both ? 'relay+public' : 'relay') : 'public'

  const peers = new Set()
  const laneOf = new Map() // peerId → lane index
  const actions = lanes.map((lane, i) => {
    const action = lane.makeAction('msg')
    action.onMessage = async (data, {peerId}) => {
      try {
        const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(data.iv)}, key, fromB64(data.ct))
        const msg = JSON.parse(dec.decode(plain))
        handlers[msg.t]?.(msg.d, peerId)
      } catch (err) {
        console.warn('Dropped message that failed to decrypt', err)
      }
    }
    lane.onPeerJoin = peerId => {
      peers.add(peerId)
      laneOf.set(peerId, i)
      onPeerJoin?.(peerId)
    }
    lane.onPeerLeave = peerId => {
      peers.delete(peerId)
      laneOf.delete(peerId)
      onPeerLeave?.(peerId)
    }
    return action
  })

  async function send(type, data, target) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, enc.encode(JSON.stringify({t: type, d: data})))
    const body = {iv: toB64(iv), ct: toB64Large(ct)}
    const targets = target ? [[actions[laneOf.get(target) ?? 0], {target}]] : actions.map(a => [a, undefined])
    for (const [action, opts] of targets) {
      try {
        await action.send(body, opts)
      } catch (err) {
        console.warn('Send failed', err)
      }
    }
  }

  return {
    via,
    peers,
    send,
    leave: () => Promise.all(lanes.map(l => l.leave()))
  }
}

// Pairing codes use an unambiguous alphabet: no 0/O, 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomCode(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

export const ROOM_LEN = 6
export const SECRET_LEN = 10

// Short typed code: room + secret, grouped in fours.
export function shortCode(room, secret) {
  return (room + secret).match(/.{1,4}/g).join('-')
}

export function parseShortCode(text) {
  const clean = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (clean.length !== ROOM_LEN + SECRET_LEN) return null
  if ([...clean].some(c => !ALPHABET.includes(c))) return null
  return {room: clean.slice(0, ROOM_LEN), secret: clean.slice(ROOM_LEN)}
}

export function pairingUrl(room, secret) {
  const base = location.href.split('#')[0].split('?')[0]
  return `${base}#pair=${shortCode(room, secret)}`
}

export function parsePairing(text) {
  const m = /#pair=([A-Za-z0-9-]+)/.exec(text)
  return parseShortCode(m ? m[1] : text)
}
