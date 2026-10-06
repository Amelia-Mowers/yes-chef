// Head-device licensing. A license is a token signed by api.yes-chef.win that
// says "this device is the head for a paid account until <exp>". It's verified
// offline with the public key the app ships with, refreshed daily when online,
// and honoured for GRACE_MS after it expires so a dead internet line never
// stops a kitchen mid-service.

import {kv} from './db.js'
import {state} from './store.js'
import {LICENSE_PUBLIC_KEY, DEV_LICENSE_PUBLIC_KEY} from './license-key.js'
import {inAndroidApp} from './platform.js'

const DAY = 86400000
export const GRACE_MS = 7 * DAY
const local = () => location.hostname === 'localhost' || location.hostname === '127.0.0.1'
export const API_URL = local() ? 'http://localhost:8799' : 'https://api.yes-chef.win'

// The head needs a subscription in the Android app. The browser version is free
// during early access (until the app launches; see docs/ROADMAP.md).
export const ENFORCE = inAndroidApp()

const enc = new TextEncoder()
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0))

export const license = {token: null, claims: null, problem: null} // problem: 'moved' | 'lapsed' | null
const listeners = new Set()
export const onLicense = fn => (listeners.add(fn), () => listeners.delete(fn))
const emit = () => listeners.forEach(fn => fn(license))

let verifyKey = null
async function key() {
  verifyKey ||= await crypto.subtle.importKey('jwk', local() ? DEV_LICENSE_PUBLIC_KEY : LICENSE_PUBLIC_KEY, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify'])
  return verifyKey
}

export async function verify(token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  try {
    const ok = await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, await key(), fromB64url(sig), enc.encode(body))
    const claims = ok && JSON.parse(new TextDecoder().decode(fromB64url(body)))
    return claims && claims.dev === state.deviceId ? claims : null
  } catch {
    return null
  }
}

// 'none' | 'active' | 'grace' (expired, still honoured offline) | 'lapsed' | 'moved'
export function licenseStatus(now = Date.now()) {
  if (license.problem === 'moved') return 'moved'
  if (!license.claims) return license.problem === 'lapsed' ? 'lapsed' : 'none'
  if (license.claims.exp > now) return 'active'
  return license.claims.exp + GRACE_MS > now ? 'grace' : 'lapsed'
}

export const isLicensed = () => ['active', 'grace'].includes(licenseStatus())

async function save(token) {
  license.token = token
  license.claims = token ? await verify(token) : null
  license.problem = null
  await kv.set('license', token)
  emit()
}

export async function loadLicense() {
  const token = await kv.get('license')
  license.token = token || null
  license.claims = token ? await verify(token) : null
  license.problem = (await kv.get('licenseProblem')) || null
  emit()
  refreshLicense().catch(() => {})
}

async function call(path, body, headers = {}) {
  const res = await fetch(API_URL + path, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)})
  const data = await res.json().catch(() => ({}))
  return {status: res.status, data}
}

// Called with a Google Play purchase token after buying or restoring.
// Resolves {ok} or {error, deviceName} ('bound_elsewhere' lets the UI offer a move).
export async function activateLicense(purchaseToken, {transfer = false, deviceName} = {}) {
  const {status, data} = await call('/v1/license/activate', {purchaseToken, deviceId: state.deviceId, deviceName: deviceName || 'Head', transfer})
  if (status === 200) {
    await save(data.license)
    await kv.del('licenseProblem')
    return {ok: true, ...data}
  }
  return {error: data.error || `http_${status}`, ...data}
}

// Refreshes when the license is older than a day. Network failures are fine:
// the current license (and then the grace period) keeps working.
export async function refreshLicense({force = false} = {}) {
  if (!license.token) return
  const ageOk = license.claims && Date.now() - license.claims.iat < DAY
  if (ageOk && !force) return
  const {status, data} = await call('/v1/license/refresh', {license: license.token})
  if (status === 200) return save(data.license)
  if (status === 409 || status === 402) {
    license.problem = status === 409 ? 'moved' : 'lapsed'
    if (status === 409) license.movedTo = data.deviceName
    await kv.set('licenseProblem', license.problem)
    emit()
  }
}

// Drops the license on this tablet (after deleting the account's cloud data).
export async function forgetLicense() {
  Object.assign(license, {token: null, claims: null, problem: null})
  await kv.del('license')
  await kv.del('licenseProblem')
  emit()
}

export function authHeader() {
  return license.token ? {authorization: `License ${license.token}`} : {}
}

setInterval(() => refreshLicense().catch(() => {}), 3 * 3600000)
