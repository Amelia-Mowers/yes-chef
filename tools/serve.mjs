// Dev server that mimics GitHub Pages: the app is served under /yes-chef/.
import {createServer} from 'node:http'
import {readFile, stat} from 'node:fs/promises'
import {extname, join, normalize} from 'node:path'

// ROOT can point at an assembled copy of the site (the update test does this).
const ROOT = process.env.ROOT || new URL('..', import.meta.url).pathname
const BASE = '/yes-chef/'
const PORT = Number(process.env.PORT) || 8080
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png'}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(302, {location: BASE})
    return res.end()
  }
  let path = normalize(decodeURIComponent(url.pathname.slice(BASE.length)))
  if (path.startsWith('..') || /^(node_modules|tools|test|vendor-src)\//.test(path)) {
    res.writeHead(404)
    return res.end()
  }
  if (!path || path === '.' || path.endsWith('/')) path = join(path, 'index.html')
  try {
    const file = join(ROOT, path)
    if ((await stat(file)).isDirectory()) throw new Error('dir')
    res.writeHead(200, {'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache'})
    res.end(await readFile(file))
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(PORT, () => console.log(`Yes Chef on http://localhost:${PORT}${BASE}`))
