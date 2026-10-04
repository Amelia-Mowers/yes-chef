// Offline app shell. Bump VERSION whenever any shell file changes.
const VERSION = 'yes-chef-v3'
// Sheffield's library and WASM come from a pinned CDN version; cache them so a
// hired Sheffield works offline. Model weights are cached by transformers.js.
const RUNTIME = 'sheffield-runtime'
const RUNTIME_HOSTS = ['cdn.jsdelivr.net']
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
  'js/sheffield/agent.js',
  'js/sheffield/commands.js',
  'js/sheffield/handoff.js',
  'js/sheffield/models.js',
  'js/sheffield/ops.js',
  'js/sheffield/parse.js',
  'js/sheffield/prompt.js',
  'js/sheffield/session.js',
  'js/sheffield/voice.js',
  'js/sheffield/worker.js',
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
      .then(keys => Promise.all(keys.filter(k => k.startsWith('yes-chef-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Cache first for the shell (works offline); refresh the cache in the background.
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (RUNTIME_HOSTS.includes(url.hostname) && url.pathname.includes('@')) {
    // Pinned versions never change: cache first, forever.
    event.respondWith(
      caches.open(RUNTIME).then(async cache => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      })
    )
    return
  }
  if (url.origin !== location.origin) return
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
