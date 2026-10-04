// Screen Wake Lock: on by default for kitchens, off for the head device.

import {state} from './store.js'

let sentinel = null

export function wakeLockOn() {
  return state.local.wakeLock ?? state.role === 'kitchen'
}

export async function applyWakeLock() {
  const want = wakeLockOn() && document.visibilityState === 'visible'
  if (!('wakeLock' in navigator)) return
  try {
    if (want && !sentinel) {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => (sentinel = null))
    } else if (!want && sentinel) {
      await sentinel.release()
      sentinel = null
    }
  } catch {
    sentinel = null
  }
}

// The lock is dropped whenever the page is hidden, so take it again on return.
document.addEventListener('visibilitychange', applyWakeLock)
