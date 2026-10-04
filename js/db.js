// Thin IndexedDB wrapper: a key/value store, the event log, and menu backups.

const DB_NAME = 'yes-chef'
const DB_VERSION = 1

let dbPromise

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', {keyPath: 'seq'})
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', {keyPath: 'id', autoIncrement: true})
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx(store, mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    let result
    Promise.resolve(fn(t.objectStore(store))).then(r => (result = r), reject)
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export const kv = {
  get: key => tx('kv', 'readonly', s => promisify(s.get(key))),
  set: (key, value) => tx('kv', 'readwrite', s => s.put(value, key)),
  del: key => tx('kv', 'readwrite', s => s.delete(key))
}

export const events = {
  all: () => tx('events', 'readonly', s => promisify(s.getAll())),
  put: evt => tx('events', 'readwrite', s => s.put(evt)),
  putMany: list => tx('events', 'readwrite', s => list.forEach(e => s.put(e))),
  replaceAll: list =>
    tx('events', 'readwrite', s => {
      s.clear()
      list.forEach(e => s.put(e))
    }),
  clear: () => tx('events', 'readwrite', s => s.clear())
}

const MAX_BACKUPS = 30

export const backups = {
  all: async () => (await tx('backups', 'readonly', s => promisify(s.getAll()))).reverse(),
  get: id => tx('backups', 'readonly', s => promisify(s.get(id))),
  add: async backup => {
    await tx('backups', 'readwrite', s => s.add(backup))
    const list = await tx('backups', 'readonly', s => promisify(s.getAllKeys()))
    const extra = list.slice(0, Math.max(0, list.length - MAX_BACKUPS))
    if (extra.length) await tx('backups', 'readwrite', s => extra.forEach(k => s.delete(k)))
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {}
}
