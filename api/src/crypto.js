// Licenses: compact tokens "<payload>.<signature>" (base64url), ECDSA P-256 /
// SHA-256. The app verifies them offline with the public key it ships with.
// Backups: AES-GCM with a per-account key derived (HKDF) from BACKUP_MASTER_KEY.

const enc = new TextEncoder()
const dec = new TextDecoder()

export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0))
const ALG = {name: 'ECDSA', namedCurve: 'P-256'}
const SIGN = {name: 'ECDSA', hash: 'SHA-256'}

let signingKey = null
async function privateKey(env) {
  if (!signingKey) signingKey = await crypto.subtle.importKey('jwk', JSON.parse(env.LICENSE_PRIVATE_KEY), ALG, false, ['sign'])
  return signingKey
}

export async function signLicense(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign(SIGN, await privateKey(env), enc.encode(body))
  return `${body}.${b64url(sig)}`
}

// Verifies a token this server issued (used when the app presents its license).
export async function readLicense(env, token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  const jwk = JSON.parse(env.LICENSE_PRIVATE_KEY)
  const {d, key_ops, ...pub} = jwk
  const key = await crypto.subtle.importKey('jwk', {...pub, key_ops: ['verify']}, ALG, false, ['verify'])
  const ok = await crypto.subtle.verify(SIGN, key, fromB64url(sig), enc.encode(body))
  return ok ? JSON.parse(dec.decode(fromB64url(body))) : null
}

async function accountKey(env, accountId) {
  const master = await crypto.subtle.importKey('raw', fromB64url(env.BACKUP_MASTER_KEY.replace(/=+$/, '')), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt: enc.encode('yes-chef-backup-v1'), info: enc.encode(accountId)}, master, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt'])
}

export async function sealBackup(env, accountId, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await accountKey(env, accountId), enc.encode(text))
  const out = new Uint8Array(1 + iv.length + ct.byteLength)
  out[0] = 1 // format version
  out.set(iv, 1)
  out.set(new Uint8Array(ct), 13)
  return out
}

export async function openBackup(env, accountId, bytes) {
  const data = new Uint8Array(bytes)
  if (data[0] !== 1) throw new Error('unknown backup format')
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: data.slice(1, 13)}, await accountKey(env, accountId), data.slice(13))
  return dec.decode(plain)
}

export const newId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
