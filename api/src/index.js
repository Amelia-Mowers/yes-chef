// api.yes-chef.win: licensing and remote backups for head devices.
//
//   POST /v1/license/activate  {purchaseToken, deviceId, deviceName, transfer?}
//   POST /v1/license/refresh   {license}
//   POST /v1/play/rtdn?key=…   Pub/Sub push from Google Play (renewals, cancellations)
//   POST /v1/backups?reason=…  body: backup JSON      (Authorization: License <token>)
//   GET  /v1/backups                                  (list)
//   GET  /v1/backups/:id                              (download)
//
// One subscription = one account = one head device at a time. Licenses last 7
// days and are refreshed by the app; it allows a further offline grace period.

import {signLicense, readLicense, sealBackup, openBackup, newId} from './crypto.js'
import {checkPlaySubscription, acknowledgePlaySubscription, entitled} from './play.js'

const DAY = 86400000
const LICENSE_DAYS = 7
const RECHECK_AFTER = 12 * 3600000
const MAX_BACKUP_BYTES = 10 * 1024 * 1024
const KEEP_BACKUPS = 60

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code)
    this.status = status
    this.extra = extra
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin')
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim())
  return origin && allowed.includes(origin)
    ? {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin'}
    : {}
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...headers}})

async function body(request) {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, 'bad_json')
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors})
    try {
      const res = await route(request, env)
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
      return res
    } catch (err) {
      if (err instanceof HttpError) return json({error: err.message, ...err.extra}, err.status, cors)
      console.error(err)
      return json({error: 'server_error'}, 500, cors)
    }
  }
}

async function route(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  const m = request.method
  if (path === '/health') return new Response('ok', {headers: {'cache-control': 'no-store'}})
  if (m === 'POST' && path === '/v1/license/activate') return activate(env, await body(request))
  if (m === 'POST' && path === '/v1/license/refresh') return refresh(env, await body(request))
  if (m === 'POST' && path === '/v1/play/rtdn') return rtdn(env, url, request)
  if (path === '/v1/backups' && m === 'POST') return createBackup(env, request, url)
  if (path === '/v1/backups' && m === 'GET') return listBackups(env, request)
  const one = /^\/v1\/backups\/(bk_[a-z0-9]+)$/.exec(path)
  if (one && m === 'GET') return getBackup(env, request, one[1])
  throw new HttpError(404, 'not_found')
}

// ---------- subscriptions ----------

async function upsertSubscription(env, token, check, accountId) {
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO subscriptions (purchase_token, account_id, platform, product_id, state, expires_at, acknowledged, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(purchase_token) DO UPDATE SET product_id = ?4, state = ?5, expires_at = ?6, acknowledged = MAX(acknowledged, ?7), updated_at = ?8`
  )
    .bind(token, accountId, token.startsWith('test-') ? 'test' : 'play', check.productId, check.state, check.expiresAt, check.acknowledged ? 1 : 0, now)
    .run()
  return env.DB.prepare('SELECT * FROM subscriptions WHERE purchase_token = ?').bind(token).first()
}

// Finds (or creates) the account for a purchase: by its own token, then by the
// token it replaced (upgrade / resubscribe), else a new account.
async function accountFor(env, token, check) {
  const own = await env.DB.prepare('SELECT account_id FROM subscriptions WHERE purchase_token = ?').bind(token).first()
  if (own) return own.account_id
  if (check.linkedPurchaseToken) {
    const linked = await env.DB.prepare('SELECT account_id FROM subscriptions WHERE purchase_token = ?').bind(check.linkedPurchaseToken).first()
    if (linked) return linked.account_id
  }
  const id = newId('acc')
  await env.DB.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').bind(id, Date.now()).run()
  return id
}

async function syncFromPlay(env, token) {
  const check = await checkPlaySubscription(env, token)
  if (!check) return null
  const accountId = await accountFor(env, token, check)
  let sub = await upsertSubscription(env, token, check, accountId)
  if (!sub.acknowledged && check.productId && entitled(sub)) {
    await acknowledgePlaySubscription(env, token, check.productId)
    await env.DB.prepare('UPDATE subscriptions SET acknowledged = 1 WHERE purchase_token = ?').bind(token).run()
    sub = {...sub, acknowledged: 1}
  }
  return sub
}

// The best current subscription for an account, rechecking stale ones with Play.
async function currentSubscription(env, accountId) {
  const {results} = await env.DB.prepare('SELECT * FROM subscriptions WHERE account_id = ? ORDER BY expires_at DESC').bind(accountId).all()
  for (const sub of results) {
    const fresh = Date.now() - sub.updated_at > RECHECK_AFTER ? (await syncFromPlay(env, sub.purchase_token)) || sub : sub
    if (entitled(fresh)) return fresh
  }
  return results[0] || null
}

async function issue(env, accountId, head, sub) {
  const now = Date.now()
  const exp = Math.min(now + LICENSE_DAYS * DAY, Math.max(sub.expires_at || 0, now + DAY))
  const license = await signLicense(env, {v: 1, acc: accountId, dev: head.device_id, st: sub.state, iat: now, exp})
  return json({license, account: accountId, state: sub.state, expiresAt: exp, subscriptionExpiresAt: sub.expires_at, deviceName: head.device_name})
}

// ---------- licensing ----------

async function activate(env, {purchaseToken, deviceId, deviceName, transfer}) {
  if (typeof purchaseToken !== 'string' || !purchaseToken || typeof deviceId !== 'string' || !deviceId) throw new HttpError(400, 'missing_fields')
  const sub = await syncFromPlay(env, purchaseToken)
  if (!sub) throw new HttpError(404, 'unknown_purchase')
  if (!entitled(sub)) throw new HttpError(402, 'not_active', {state: sub.state})
  const accountId = sub.account_id
  const name = String(deviceName || 'Head').slice(0, 60)
  let head = await env.DB.prepare('SELECT * FROM heads WHERE account_id = ?').bind(accountId).first()
  if (head && head.device_id !== deviceId && !transfer) {
    throw new HttpError(409, 'bound_elsewhere', {deviceName: head.device_name, boundAt: head.bound_at})
  }
  if (!head || head.device_id !== deviceId) {
    await env.DB.prepare('INSERT INTO heads (account_id, device_id, device_name, bound_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(account_id) DO UPDATE SET device_id = ?2, device_name = ?3, bound_at = ?4')
      .bind(accountId, deviceId, name, Date.now())
      .run()
  } else if (head.device_name !== name) {
    await env.DB.prepare('UPDATE heads SET device_name = ? WHERE account_id = ?').bind(name, accountId).run()
  }
  head = {device_id: deviceId, device_name: name}
  return issue(env, accountId, head, sub)
}

// Checks a presented license: valid signature, and still the bound head.
async function authorize(env, token, {allowExpired = false} = {}) {
  const lic = await readLicense(env, token)
  if (!lic) throw new HttpError(401, 'bad_license')
  if (!allowExpired && lic.exp < Date.now()) throw new HttpError(401, 'license_expired')
  const head = await env.DB.prepare('SELECT * FROM heads WHERE account_id = ?').bind(lic.acc).first()
  if (!head || head.device_id !== lic.dev) throw new HttpError(409, 'moved', {deviceName: head?.device_name})
  return {lic, head}
}

async function refresh(env, {license}) {
  // An expired license can still be refreshed if the subscription is active.
  const {lic, head} = await authorize(env, license, {allowExpired: true})
  const sub = await currentSubscription(env, lic.acc)
  if (!entitled(sub)) throw new HttpError(402, 'not_active', {state: sub?.state || 'expired'})
  return issue(env, lic.acc, head, sub)
}

// Google Play Real-time Developer Notifications via a Pub/Sub push subscription.
async function rtdn(env, url, request) {
  if (!env.RTDN_SECRET || url.searchParams.get('key') !== env.RTDN_SECRET) throw new HttpError(403, 'forbidden')
  const msg = await body(request)
  let note
  try {
    note = JSON.parse(atob(msg.message?.data || ''))
  } catch {
    return new Response(null, {status: 204}) // malformed: ack so Pub/Sub doesn't retry forever
  }
  const token = note.subscriptionNotification?.purchaseToken
  if (token && note.packageName === env.PLAY_PACKAGE_NAME) await syncFromPlay(env, token)
  return new Response(null, {status: 204})
}

// ---------- backups ----------

function licenseFrom(request) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('License ')) throw new HttpError(401, 'missing_license')
  return auth.slice(8)
}

async function createBackup(env, request, url) {
  const {lic, head} = await authorize(env, licenseFrom(request))
  const text = await request.text()
  if (text.length > MAX_BACKUP_BYTES) throw new HttpError(413, 'too_large')
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'bad_json')
  }
  if (!data || data.app !== 'yes-chef' || !Array.isArray(data.events)) throw new HttpError(400, 'not_a_backup')
  // Only menu, settings and the order log are kept, never anything else a client sends.
  const clean = JSON.stringify({app: 'yes-chef', kind: 'backup', exportedAt: data.exportedAt || new Date().toISOString(), menu: data.menu ?? null, settings: data.settings ?? null, events: data.events})
  const id = newId('bk')
  const key = `${lic.acc}/${id}`
  const sealed = await sealBackup(env, lic.acc, clean)
  await env.BACKUPS.put(key, sealed)
  const reason = String(url.searchParams.get('reason') || 'manual').slice(0, 40)
  await env.DB.prepare('INSERT INTO backups (id, account_id, created_at, reason, device_name, size, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, lic.acc, Date.now(), reason, head.device_name, sealed.byteLength, key)
    .run()
  // Keep the newest KEEP_BACKUPS.
  const {results: old} = await env.DB.prepare('SELECT id, r2_key FROM backups WHERE account_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?').bind(lic.acc, KEEP_BACKUPS).all()
  for (const b of old) {
    await env.BACKUPS.delete(b.r2_key)
    await env.DB.prepare('DELETE FROM backups WHERE id = ?').bind(b.id).run()
  }
  return json({id, createdAt: Date.now()}, 201)
}

async function listBackups(env, request) {
  const {lic} = await authorize(env, licenseFrom(request))
  const {results} = await env.DB.prepare('SELECT id, created_at AS createdAt, reason, device_name AS deviceName, size FROM backups WHERE account_id = ? ORDER BY created_at DESC').bind(lic.acc).all()
  return json({backups: results})
}

async function getBackup(env, request, id) {
  const {lic} = await authorize(env, licenseFrom(request))
  const row = await env.DB.prepare('SELECT * FROM backups WHERE id = ? AND account_id = ?').bind(id, lic.acc).first()
  if (!row) throw new HttpError(404, 'not_found')
  const obj = await env.BACKUPS.get(row.r2_key)
  if (!obj) throw new HttpError(404, 'not_found')
  return new Response(await openBackup(env, lic.acc, await obj.arrayBuffer()), {headers: {'content-type': 'application/json', 'cache-control': 'no-store'}})
}
