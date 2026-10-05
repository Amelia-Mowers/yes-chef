// Google Play subscription checks (Play Developer API, subscriptionsv2).
// With TEST_PURCHASES=true (dev/tests), tokens like "test-active-1",
// "test-expired-1", "test-grace-1" are answered locally instead.

import {b64url} from './crypto.js'

const enc = new TextEncoder()
const DAY = 86400000

// Our states, from Play's SubscriptionState.
const STATE = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_CANCELED: 'canceled', // still usable until expiry
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired'
}

// Whether a subscription currently entitles its head device.
export function entitled(sub, now = Date.now()) {
  if (!sub) return false
  if (sub.state === 'active' || sub.state === 'grace') return true
  return sub.state === 'canceled' && sub.expires_at > now
}

let cachedToken = null
async function accessToken(env) {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.value
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(enc.encode(JSON.stringify({alg: 'RS256', typ: 'JWT'})))
  const claims = b64url(enc.encode(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600})))
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}`})
  })
  if (!res.ok) throw new Error(`Google auth failed (${res.status})`)
  const data = await res.json()
  cachedToken = {value: data.access_token, exp: Date.now() + data.expires_in * 1000}
  return cachedToken.value
}

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'

// Returns {state, expiresAt, productId, linkedPurchaseToken, acknowledged} or null if unknown.
export async function checkPlaySubscription(env, purchaseToken) {
  if (env.TEST_PURCHASES === 'true' && purchaseToken.startsWith('test-')) return fakeSubscription(purchaseToken)
  const res = await fetch(`${API}/${env.PLAY_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
    headers: {authorization: `Bearer ${await accessToken(env)}`}
  })
  if (res.status === 404 || res.status === 410) return null
  if (!res.ok) throw new Error(`Play check failed (${res.status})`)
  const sub = await res.json()
  const line = (sub.lineItems || []).reduce((a, b) => (Date.parse(b.expiryTime || 0) > Date.parse(a?.expiryTime || 0) ? b : a), null)
  return {
    state: STATE[sub.subscriptionState] || 'expired',
    expiresAt: line?.expiryTime ? Date.parse(line.expiryTime) : null,
    productId: line?.productId || null,
    linkedPurchaseToken: sub.linkedPurchaseToken || null,
    acknowledged: sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
  }
}

// Google refunds purchases that aren't acknowledged within 3 days.
export async function acknowledgePlaySubscription(env, purchaseToken, productId) {
  if (env.TEST_PURCHASES === 'true' && purchaseToken.startsWith('test-')) return
  const res = await fetch(`${API}/${env.PLAY_PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
    method: 'POST',
    headers: {authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json'},
    body: '{}'
  })
  if (!res.ok && res.status !== 409) throw new Error(`Play acknowledge failed (${res.status})`)
}

function fakeSubscription(token) {
  const [, kind = 'active', , linked] = token.split('-') // test-<state>-<n>[-<linked n>]
  const now = Date.now()
  const state = {active: 'active', grace: 'grace', expired: 'expired', canceled: 'canceled', hold: 'on_hold'}[kind] || 'active'
  return {
    state,
    expiresAt: state === 'expired' ? now - DAY : now + 30 * DAY,
    productId: 'yes_chef_head',
    linkedPurchaseToken: linked ? `test-${kind}-${linked}` : null,
    acknowledged: false
  }
}
