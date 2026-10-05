// Licensing and backup API, against a local `wrangler dev` (fake Play purchases).
import {test, before, after} from 'node:test'
import assert from 'node:assert/strict'
import {spawn, execFileSync} from 'node:child_process'
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const PORT = 8799
const API = `http://localhost:${PORT}`
const persist = mkdtempSync(join(tmpdir(), 'yes-chef-api-'))
let worker
let publicKey

const enc = new TextEncoder()
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0))

before(async () => {
  const pair = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify'])
  publicKey = pair.publicKey
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const master = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
  writeFileSync('api/.dev.vars', `LICENSE_PRIVATE_KEY='${JSON.stringify(priv)}'\nBACKUP_MASTER_KEY=${master}\nRTDN_SECRET=rtdn-test\n`)
  const args = ['--config', 'api/wrangler.jsonc', '--env', 'dev', '--persist-to', persist]
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', ...args], {stdio: 'ignore'})
  worker = spawn('npx', ['wrangler', 'dev', ...args, '--port', String(PORT)], {stdio: 'ignore', detached: true})
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${API}/health`)).ok) break
    } catch {}
    if (i > 120) throw new Error('api did not start')
    await new Promise(r => setTimeout(r, 500))
  }
})

after(() => {
  try {
    process.kill(-worker.pid)
  } catch {}
  rmSync('api/.dev.vars', {force: true})
  rmSync(persist, {recursive: true, force: true})
})

const post = (path, body, headers = {}) => fetch(API + path, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: typeof body === 'string' ? body : JSON.stringify(body)})
const activate = async body => {
  const res = await post('/v1/license/activate', body)
  return {status: res.status, data: await res.json()}
}

async function verifyLicense(token) {
  const [body, sig] = token.split('.')
  const ok = await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, publicKey, fromB64url(sig), enc.encode(body))
  return ok && JSON.parse(new TextDecoder().decode(fromB64url(body)))
}

let licenseA
let licenseB

test('activating a purchase binds the head and returns a signed license', async () => {
  const {status, data} = await activate({purchaseToken: 'test-active-1', deviceId: 'dev_A', deviceName: 'Front tablet'})
  assert.equal(status, 200)
  const lic = await verifyLicense(data.license)
  assert.equal(lic.dev, 'dev_A')
  assert.equal(lic.st, 'active')
  assert.ok(lic.exp > Date.now() + 6 * 86400000)
  licenseA = data.license
})

test('a second device is refused unless it asks to take over', async () => {
  const refused = await activate({purchaseToken: 'test-active-1', deviceId: 'dev_B', deviceName: 'New tablet'})
  assert.equal(refused.status, 409)
  assert.equal(refused.data.error, 'bound_elsewhere')
  assert.equal(refused.data.deviceName, 'Front tablet')
  const moved = await activate({purchaseToken: 'test-active-1', deviceId: 'dev_B', deviceName: 'New tablet', transfer: true})
  assert.equal(moved.status, 200)
  licenseB = moved.data.license
  const stale = await post('/v1/license/refresh', {license: licenseA})
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).deviceName, 'New tablet')
  const ok = await post('/v1/license/refresh', {license: licenseB})
  assert.equal(ok.status, 200)
})

test('expired subscriptions are refused; resubscribing keeps the account', async () => {
  const expired = await activate({purchaseToken: 'test-expired-9', deviceId: 'dev_C'})
  assert.equal(expired.status, 402)
  const first = await activate({purchaseToken: 'test-active-1', deviceId: 'dev_B', deviceName: 'New tablet'})
  const renewed = await activate({purchaseToken: 'test-active-2-1', deviceId: 'dev_B', deviceName: 'New tablet'})
  assert.equal(renewed.status, 200)
  assert.equal(renewed.data.account, first.data.account, 'linked purchase token joins the same account')
})

test('backups are stored per account and only the bound head can use them', async () => {
  const backup = {app: 'yes-chef', kind: 'backup', exportedAt: '2026-10-05T12:00:00Z', menu: {version: 1, categories: [], modifierGroups: []}, settings: null, events: [{seq: 1, type: 'order.created'}], sheffieldChat: ['not kept']}
  const auth = {authorization: `License ${licenseB}`}
  const created = await post('/v1/backups?reason=daily', backup, auth)
  assert.equal(created.status, 201)
  const {id} = await created.json()
  const list = await (await fetch(`${API}/v1/backups`, {headers: auth})).json()
  assert.deepEqual(list.backups.map(b => [b.id, b.reason, b.deviceName]), [[id, 'daily', 'New tablet']])
  const restored = await (await fetch(`${API}/v1/backups/${id}`, {headers: auth})).json()
  assert.deepEqual(restored.events, backup.events)
  assert.equal(restored.sheffieldChat, undefined, 'only menu, settings and events are kept')
  const fromOldHead = await post('/v1/backups', backup, {authorization: `License ${licenseA}`})
  assert.equal(fromOldHead.status, 409)
  const noLicense = await fetch(`${API}/v1/backups`)
  assert.equal(noLicense.status, 401)
  const forged = await fetch(`${API}/v1/backups`, {headers: {authorization: `License ${licenseB.slice(0, -4)}AAAA`}})
  assert.equal(forged.status, 401)
})

test('Play notifications need the shared key; CORS only for allowed origins', async () => {
  assert.equal((await post('/v1/play/rtdn', {message: {data: ''}})).status, 403)
  assert.equal((await post('/v1/play/rtdn?key=rtdn-test', {message: {data: btoa(JSON.stringify({packageName: 'win.yeschef.app', subscriptionNotification: {purchaseToken: 'test-active-1'}}))}})).status, 204)
  const ok = await fetch(`${API}/v1/license/refresh`, {method: 'OPTIONS', headers: {Origin: 'http://localhost:8091'}})
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:8091')
  const bad = await fetch(`${API}/v1/license/refresh`, {method: 'OPTIONS', headers: {Origin: 'https://evil.example'}})
  assert.equal(bad.headers.get('access-control-allow-origin'), null)
})
