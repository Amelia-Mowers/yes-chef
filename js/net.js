// Peer-to-peer transport. Trystero handles signaling (public Nostr relays) and
// WebRTC data channels; every payload is additionally AES-GCM encrypted with a
// key derived from the pairing secret.

import {joinRoom, selfId} from '../vendor/trystero.js'

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

// Creates a connection to the room. `handlers` maps message type → fn(data, peerId).
export async function connect({room, secret, onPeerJoin, onPeerLeave, handlers}) {
  const key = await deriveKey(secret, room)
  const trystero = joinRoom({appId: APP_ID, password: secret}, room)
  const action = trystero.makeAction('msg')
  const peers = new Set()

  action.onMessage = async (data, {peerId}) => {
    try {
      const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(data.iv)}, key, fromB64(data.ct))
      const msg = JSON.parse(dec.decode(plain))
      handlers[msg.t]?.(msg.d, peerId)
    } catch (err) {
      console.warn('Dropped message that failed to decrypt', err)
    }
  }

  trystero.onPeerJoin = peerId => {
    peers.add(peerId)
    onPeerJoin?.(peerId)
  }
  trystero.onPeerLeave = peerId => {
    peers.delete(peerId)
    onPeerLeave?.(peerId)
  }

  async function send(type, data, target) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, enc.encode(JSON.stringify({t: type, d: data})))
    try {
      await action.send({iv: toB64(iv), ct: toB64Large(ct)}, target ? {target} : undefined)
    } catch (err) {
      console.warn('Send failed', err)
    }
  }

  return {
    selfId,
    peers,
    send,
    leave: () => trystero.leave()
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
