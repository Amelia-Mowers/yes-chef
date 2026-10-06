// Google Play Billing inside the Android app (Trusted Web Activity), through the
// Digital Goods API + Payment Request API. In a normal browser none of this is
// available and the head stays free (early access).
//
// Play Console products (subscriptions, each with a 30-day free-trial offer):
//   yes_chef_monthly  $18.99 / month
//   yes_chef_yearly   $189.99 / year

import {activateLicense} from './license.js'
export {inAndroidApp} from './platform.js'

export const PLAY_BILLING = 'https://play.google.com/billing'
export const PRODUCTS = [
  {id: 'yes_chef_monthly', label: 'Monthly', fallbackPrice: '$18.99 / month'},
  {id: 'yes_chef_yearly', label: 'Yearly', fallbackPrice: '$189.99 / year', note: 'two months free'}
]
let servicePromise = null
export function billingService() {
  if (!('getDigitalGoodsService' in window)) return Promise.resolve(null)
  servicePromise ||= window.getDigitalGoodsService(PLAY_BILLING).catch(() => null)
  return servicePromise
}

// Prices as Play shows them for this user (localized), or our list prices.
export async function plans() {
  const service = await billingService()
  let details = []
  if (service) {
    try {
      details = await service.getDetails(PRODUCTS.map(p => p.id))
    } catch {}
  }
  return PRODUCTS.map(p => {
    const d = details.find(x => x.itemId === p.id)
    const price = d?.price ? new Intl.NumberFormat(undefined, {style: 'currency', currency: d.price.currency}).format(Number(d.price.value)) : null
    return {...p, price: price ? `${price} / ${p.id.includes('yearly') ? 'year' : 'month'}` : p.fallbackPrice, trial: d?.freeTrialPeriod || 'P30D'}
  })
}

// Opens Google Play's purchase sheet, then activates the license on our server.
// Resolves like activateLicense: {ok} | {error, deviceName}.
export async function subscribe(productId, {deviceName, transfer} = {}) {
  const request = new PaymentRequest([{supportedMethods: PLAY_BILLING, data: {sku: productId}}], {total: {label: 'Total', amount: {currency: 'USD', value: '0'}}})
  const response = await request.show()
  const {purchaseToken} = response.details
  await response.complete('success')
  return activateLicense(purchaseToken, {deviceName, transfer})
}

// Finds an existing subscription on this Google account (new tablet, reinstall).
export async function restorePurchase({deviceName, transfer} = {}) {
  const service = await billingService()
  if (!service) return {error: 'no_billing'}
  const purchases = await service.listPurchases()
  const ours = purchases.find(p => PRODUCTS.some(x => x.id === p.itemId))
  if (!ours) return {error: 'no_purchase'}
  return activateLicense(ours.purchaseToken, {deviceName, transfer})
}
