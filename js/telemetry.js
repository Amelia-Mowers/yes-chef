// Diagnostics consent. Yes Chef collects no analytics or crash reports today.
// Anything added later MUST go through telemetryAllowed() / reportError(), so
// the Settings → Privacy switches are respected. Both default to off (opt-in).

import {state, setLocal} from './store.js'

export const KINDS = {
  crash: {label: 'Crash and error reports', hint: 'Send details of errors so they can be fixed. Never includes orders or menus.'},
  usage: {label: 'Usage analytics', hint: 'Anonymous counts of which features are used.'}
}

export function telemetryAllowed(kind) {
  return state.local?.telemetry?.[kind] === true
}

export function setTelemetry(kind, on) {
  return setLocal({telemetry: {...state.local?.telemetry, [kind]: Boolean(on)}})
}

// Future crash reporting hooks in here; today it only logs locally.
export function reportError(error, context = {}) {
  if (!telemetryAllowed('crash')) return
  // Not implemented: no reports are sent anywhere yet.
  void error
  void context
}

// Future usage analytics hooks in here; today it does nothing.
export function track(event, props = {}) {
  if (!telemetryAllowed('usage')) return
  void event
  void props
}

window.addEventListener('error', e => reportError(e.error || e.message, {source: 'window.error'}))
window.addEventListener('unhandledrejection', e => reportError(e.reason, {source: 'unhandledrejection'}))
