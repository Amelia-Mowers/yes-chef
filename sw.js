// Offline app shell. Bump VERSION whenever any shell file changes.
const VERSION = 'yes-chef-v3'
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/main.js',
  'js/store.js',
  'js/db.js',
  'js/log.js',
  'js/net.js',
  'js/ui.js',
  'js/wake.js',
  'js/theme.js',
  'js/sample-menu.js',
  'js/views/order.js',
  'js/views/kitchen.js',
  'js/views/history.js',
  'js/views/menu.js',
  'js/views/settings.js',
  'js/views/pair.js',
  'js/views/sheffield.js',
  'js/sheffield/instructions.js',
  'icons/sheffield.svg',
  'vendor/trystero.js',
  'vendor/qr.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Cache first for the shell (works offline); refresh the cache in the background.
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  event.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, {ignoreSearch: true})
      const network = fetch(req)
        .then(res => {
          if (res.ok) cache.put(req, res.clone())
          return res
        })
        .catch(() => null)
      if (cached) {
        event.waitUntil(network)
        return cached
      }
      return (await network) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error())
    })
  )
})
