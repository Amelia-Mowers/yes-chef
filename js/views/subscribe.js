// Android app, head role without an active subscription: start the trial,
// restore a purchase, or move a subscription from another tablet.

import {h, clear, toast, confirmDialog} from '../ui.js'
import {plans, subscribe, restorePurchase} from '../billing.js'
import {license, licenseStatus} from '../license.js'

export function subscribeView() {
  const el = h('div', {class: 'paywall'})
  const deviceName = 'Head tablet'

  async function handle(result, retry) {
    if (result.ok) return toast('Subscription active. You’re all set.')
    if (result.error === 'bound_elsewhere') {
      const move = await confirmDialog({
        title: 'Move the subscription to this tablet?',
        message: `It’s currently used by “${result.deviceName}”. That tablet will stop taking orders; its kitchens can pair with this one.`,
        confirm: 'Move it here'
      })
      if (move) return handle(await retry(true), retry)
      return
    }
    const messages = {no_purchase: 'No Yes Chef subscription found on this Google account.', no_billing: 'Google Play billing isn’t available here.', not_active: 'That subscription isn’t active.'}
    toast(messages[result.error] || `Something went wrong (${result.error}).`, {duration: 6000})
  }

  async function render() {
    const st = licenseStatus()
    const list = await plans()
    clear(el,
      h('img', {class: 'paywall-icon', src: 'icons/icon.svg', alt: ''}),
      h('h1', null, st === 'none' ? 'Start your 30-day free trial' : st === 'moved' ? 'This tablet is no longer the head' : 'Your subscription has ended'),
      h('p', {class: 'lead'},
        st === 'moved'
          ? `The subscription moved to ${license.movedTo || 'another tablet'}. Subscribe again for this tablet, or move it back with Restore purchase.`
          : 'One subscription covers this head tablet. Kitchen and order-taker tablets are free, as many as you like.'
      ),
      h('div', {class: 'plans'},
        list.map(p =>
          h('button', {class: 'plan', onclick: async () => {
            try {
              await handle(await subscribe(p.id, {deviceName}), transfer => subscribe(p.id, {deviceName, transfer}))
            } catch (err) {
              if (err?.name !== 'AbortError') toast(`Purchase didn’t go through: ${err.message}`, {duration: 6000})
            }
          }},
            h('strong', null, p.label),
            h('span', {class: 'price'}, p.price),
            p.note && h('small', null, p.note),
            h('small', null, '30 days free, then billed by Google Play')
          )
        )
      ),
      h('button', {class: 'btn', onclick: async () => handle(await restorePurchase({deviceName}), transfer => restorePurchase({deviceName, transfer}))}, 'Restore purchase'),
      h('p', {class: 'muted small'}, 'Cancel anytime in Google Play. History, menus and settings stay on this tablet either way.')
    )
  }
  render()
  // Re-rendered by main.js when the license changes, not on every store update.
  return {el, update() {}}
}
