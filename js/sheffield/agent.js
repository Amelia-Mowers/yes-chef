// Main-thread side of Sheffield's model: hiring (download + load), dismissal
// (delete weights), and asking with a parse/repair loop.

import {kv} from '../db.js'
import {MODELS, detectPath} from './models.js'
import {buildConversation, buildTranscription, parseReply, repairPrompt, GENERATION} from './prompt.js'

const WEIGHTS_CACHE = 'transformers-cache'
const RUNTIME_CACHE = 'sheffield-runtime'

const listeners = new Set()
export const agent = {
  status: 'unknown', // unknown | absent | installed | downloading | loading | ready | error
  tier: null, // installed tier id
  device: null,
  precision: null,
  progress: {loaded: 0, total: 0},
  error: null
}

export function onAgent(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = () => listeners.forEach(fn => fn(agent))

let worker = null
let readyPromise = null
const pending = new Map()
let seq = 0

export async function initAgent() {
  const saved = await kv.get('sheffield')
  agent.tier = saved?.tier || null
  agent.status = agent.tier ? 'installed' : 'absent'
  // "installed" = hired but not yet in memory; it loads on first use.
  emit()
}

export const isInstalled = () => Boolean(agent.tier)

// A dropped connection can leave the loader waiting forever without an error.
// If a file is mid-download and nothing arrives for this long, give up cleanly.
const STALL_MS = 60000
let watchdog = null
let lastProgressAt = 0

function stopWatchdog() {
  clearInterval(watchdog)
  watchdog = null
}

function startWatchdog(files) {
  stopWatchdog()
  lastProgressAt = Date.now()
  watchdog = setInterval(() => {
    const incomplete = [...files.values()].some(f => f.total && f.loaded < f.total)
    if (incomplete && Date.now() - lastProgressAt > STALL_MS) {
      stopWatchdog()
      worker?.terminate()
      worker = null
      Object.assign(agent, {status: 'error', error: 'network error: the download stalled'})
      emit()
      readyReject?.(new Error(agent.error))
    }
  }, 5000)
}

function spawn() {
  if (worker) return worker
  worker = new Worker(new URL('./worker.js', import.meta.url), {type: 'module'})
  const files = new Map()
  startWatchdog(files)
  worker.onmessage = ({data}) => {
    if (data.type === 'progress') {
      lastProgressAt = Date.now()
      files.set(data.file, {loaded: data.loaded, total: data.total})
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded || 0
        total += f.total || 0
      }
      agent.progress = {loaded, total}
      if (agent.status !== 'downloading' && loaded < total) agent.status = 'downloading'
      emit()
    } else if (data.type === 'file-done') {
      lastProgressAt = Date.now()
      const f = files.get(data.file)
      if (f) f.loaded = f.total
    } else if (data.type === 'ready') {
      stopWatchdog()
      Object.assign(agent, {status: 'ready', device: data.device, precision: data.precision, error: null})
      emit()
      readyResolve?.()
    } else if (data.type === 'token') pending.get(data.id)?.onToken?.(data.text)
    else if (data.type === 'done') {
      pending.get(data.id)?.resolve(data)
      pending.delete(data.id)
    } else if (data.type === 'error') {
      if (data.id != null && pending.has(data.id)) {
        pending.get(data.id).reject(new Error(data.message))
        pending.delete(data.id)
      } else {
        Object.assign(agent, {status: 'error', error: data.message})
        emit()
        readyReject?.(new Error(data.message))
      }
    }
  }
  worker.onerror = e => {
    stopWatchdog()
    Object.assign(agent, {status: 'error', error: e.message || 'Sheffield stopped unexpectedly'})
    emit()
    readyReject?.(new Error(agent.error))
    for (const p of pending.values()) p.reject(new Error(agent.error))
    pending.clear()
    worker = null
    readyPromise = null
  }
  return worker
}

let readyResolve = null
let readyReject = null

// Downloads (first time) and loads the model. Resolves when ready.
export function hire(tierId) {
  if (readyPromise && agent.tier === tierId) return readyPromise
  const previous = agent.tier && agent.status !== 'error' ? agent.tier : null
  agent.tier = tierId
  agent.status = 'loading'
  agent.progress = {loaded: 0, total: 0}
  emit()
  readyPromise = new Promise((resolve, reject) => {
    readyResolve = async () => {
      await kv.set('sheffield', {tier: tierId, hiredAt: Date.now()})
      resolve()
    }
    readyReject = reject
  })
  spawn().postMessage({type: 'load', tier: tierId})
  readyPromise.catch(async () => {
    // Failed: forget the half-loaded worker and fall back to what was hired before.
    readyPromise = null
    worker?.terminate()
    worker = null
    agent.tier = previous ?? (await kv.get('sheffield'))?.tier ?? null
    emit()
  })
  return readyPromise
}

export function ensureLoaded() {
  if (!agent.tier) return Promise.reject(new Error('Sheffield has not been hired'))
  return hire(agent.tier)
}

// Stops whatever Sheffield is doing by shutting the worker down. The model stays
// installed and loads again (from the local cache) on the next message.
export function cancel() {
  stopWatchdog()
  worker?.terminate()
  worker = null
  readyPromise = null
  for (const p of pending.values()) p.reject(new Error('stopped'))
  pending.clear()
  if (agent.tier) Object.assign(agent, {status: 'installed', error: null})
  emit()
}

// Removes the model from memory and storage. Orders and menus are untouched.
export async function dismiss() {
  stopWatchdog()
  worker?.terminate()
  worker = null
  readyPromise = null
  for (const p of pending.values()) p.reject(new Error('Sheffield was dismissed'))
  pending.clear()
  let freed = 0
  try {
    const before = (await navigator.storage?.estimate?.())?.usage || 0
    await caches.delete(WEIGHTS_CACHE)
    await caches.delete(RUNTIME_CACHE)
    const after = (await navigator.storage?.estimate?.())?.usage || 0
    freed = Math.max(0, before - after)
  } catch {}
  await kv.del('sheffield')
  Object.assign(agent, {status: 'absent', tier: null, device: null, precision: null, error: null, progress: {loaded: 0, total: 0}})
  emit()
  return freed
}

function run(conversation, image, onToken) {
  const id = ++seq
  const tier = MODELS[agent.tier]
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject, onToken})
    worker.postMessage({type: 'generate', id, conversation, image, generation: GENERATION, imageMax: tier.imageMax})
  })
}

// One Sheffield turn: returns {say, ops, questions, stats} or throws.
export async function ask({menu, history, text, image, onToken}) {
  await ensureLoaded()
  const conversation = buildConversation(menu, history, {text, hasImage: Boolean(image)})
  let result = await run(conversation, image, onToken)
  let reply = parseReply(result.text)
  if (reply.error) {
    // One repair attempt, text only, with the broken reply in context.
    onToken?.(null)
    const repair = [...conversation, {role: 'assistant', content: [{type: 'text', text: result.text}]}, {role: 'user', content: [{type: 'text', text: repairPrompt(reply.error)}]}]
    result = await run(repair, image, onToken)
    reply = parseReply(result.text)
  }
  if (reply.error) throw new Error(reply.error)
  return {...reply, stats: result.stats}
}

// Photo → plain text. A narrow task the small model does well; structure comes
// from the rule-based parser afterwards.
export async function transcribe(image, onToken) {
  await ensureLoaded()
  const result = await run(buildTranscription(), image, onToken)
  return {text: result.text.replace(/^```\w*\n?|```\s*$/g, '').trim(), stats: result.stats}
}

let pathPromise = null
export const devicePath = () => (pathPromise ||= detectPath())

export async function storageFor(tierId) {
  const tier = MODELS[tierId]
  const est = (await navigator.storage?.estimate?.().catch(() => null)) || {}
  const needMB = tier.sizeMB[await devicePath()] ?? Infinity
  const freeMB = est.quota != null ? Math.round((est.quota - (est.usage || 0)) / 1e6) : null
  return {needMB, freeMB, enough: freeMB == null || freeMB > needMB * 1.2}
}
