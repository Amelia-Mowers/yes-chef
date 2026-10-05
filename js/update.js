// New-version handling. The service worker installs a new build in the
// background and takes over (skipWaiting + clients.claim); the page then
// offers a reload instead of reloading mid-service on its own.

import {h} from './ui.js'

let registration = null
let banner = null
const CHECK_EVERY_MS = 30 * 60 * 1000

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return
  // The very first install also fires controllerchange; every later one,
  // including in this same session, is an update.
  let controlled = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) showUpdateBanner()
    controlled = true
  })
  navigator.serviceWorker
    .register('sw.js')
    .then(reg => {
      registration = reg
      setInterval(() => reg.update().catch(() => {}), CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    })
    .catch(err => console.warn('Service worker failed', err))
}

// Returns true when a newer build was found (the banner then appears once it activates).
export async function checkForUpdate() {
  if (!registration) return false
  await registration.update()
  return Boolean(registration.installing || registration.waiting)
}

export function showUpdateBanner() {
  if (banner) return
  banner = h('div', {class: 'update-banner', role: 'status'},
    h('span', null, 'A new version of Yes Chef is ready.'),
    h('button', {class: 'btn small', onclick: () => {
      banner.remove()
      banner = null
    }}, 'Later'),
    h('button', {class: 'btn primary small', onclick: () => location.reload()}, 'Reload')
  )
  document.body.append(banner)
}
