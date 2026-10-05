// relay.yes-chef.win: WebRTC signaling for Yes Chef pairing.
// Speaks Trystero's ws-relay protocol (subscribe / unsubscribe / publish on
// topics). One Durable Object per restaurant room, so a room's tablets always
// meet in the same place; hibernating WebSockets keep idle tablets nearly free.
// Only signaling passes through here; orders go tablet-to-tablet, encrypted.

import {DurableObject} from 'cloudflare:workers'

const MAX_TOPIC_LENGTH = 256
const MAX_TOPICS_PER_SOCKET = 128
const MAX_MESSAGE_BYTES = 64 * 1024
const ROOM_PATH = /^\/r\/([A-Za-z0-9_-]{4,64})$/

// Browsers send Origin; only Yes Chef's own pages may use the relay.
function originAllowed(origin, env) {
  if (!origin) return true // non-browser clients (tests, health checks)
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (allowed.includes(origin)) return true
  return env.ALLOW_LOCALHOST === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function cors(origin, env) {
  return originAllowed(origin, env) && origin ? {'Access-Control-Allow-Origin': origin, Vary: 'Origin'} : {}
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    if (url.pathname === '/health') return new Response('ok', {headers: {'Cache-Control': 'no-store', ...cors(origin, env)}})
    const match = ROOM_PATH.exec(url.pathname)
    if (!match) return new Response('Not found', {status: 404})
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', {status: 426})
    if (!originAllowed(origin, env)) return new Response('Forbidden', {status: 403})
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request)
  }
}

export class Room extends DurableObject {
  async fetch() {
    const {0: client, 1: server} = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({topics: []})
    return new Response(null, {status: 101, webSocket: client})
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return ws.close(1009, 'message too large')
    let msg
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (!msg || typeof msg.topic !== 'string') return
    if (msg.topic.length > MAX_TOPIC_LENGTH) return ws.close(1008, 'topic too long')
    const att = ws.deserializeAttachment() || {topics: []}

    if (msg.type === 'subscribe') {
      if (att.topics.includes(msg.topic)) return
      if (att.topics.length >= MAX_TOPICS_PER_SOCKET) return ws.close(1008, 'subscription limit exceeded')
      att.topics.push(msg.topic)
      ws.serializeAttachment(att)
    } else if (msg.type === 'unsubscribe') {
      att.topics = att.topics.filter(t => t !== msg.topic)
      ws.serializeAttachment(att)
    } else if (msg.type === 'publish' && 'payload' in msg) {
      const out = JSON.stringify({topic: msg.topic, payload: msg.payload})
      for (const peer of this.ctx.getWebSockets()) {
        if ((peer.deserializeAttachment()?.topics || []).includes(msg.topic)) {
          try {
            peer.send(out)
          } catch {}
        }
      }
    }
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'closing')
    } catch {}
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, 'error')
    } catch {}
  }
}
