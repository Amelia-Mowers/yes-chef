// Small DOM helpers: element builder, toasts, sheets and confirm dialogs.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style' && typeof v === 'object') {
      // setProperty, because assigning to el.style ignores custom properties (--cat).
      for (const [p, val] of Object.entries(v)) el.style.setProperty(p.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), val)
    }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'html') el.innerHTML = v
    else if (k in el && typeof v !== 'string') el[k] = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  append(el, children)
  return el
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
}

export function clear(el, ...children) {
  el.replaceChildren()
  append(el, children)
  return el
}

// ---------- toasts ----------

const toastHost = () => document.getElementById('toasts')

export function toast(message, {action, onAction, duration = 4000} = {}) {
  const bar = h('div', {class: 'toast-progress', style: {animationDuration: duration + 'ms'}})
  const el = h('div', {class: 'toast', role: 'status'}, h('span', {class: 'toast-msg'}, message))
  let done = false
  const close = () => {
    if (done) return
    done = true
    el.classList.add('out')
    setTimeout(() => el.remove(), 200)
  }
  if (action) {
    el.append(
      h('button', {class: 'btn toast-action', onclick: () => {
        close()
        onAction?.()
      }}, action)
    )
    el.append(bar)
  }
  toastHost().append(el)
  setTimeout(close, duration)
  return close
}

// ---------- sheets / dialogs ----------

export function sheet(build, {wide = false, onClose} = {}) {
  const panel = h('div', {class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true'})
  const backdrop = h('div', {class: 'backdrop', onclick: e => e.target === backdrop && close()}, panel)
  const close = () => {
    backdrop.classList.add('out')
    setTimeout(() => backdrop.remove(), 180)
    document.removeEventListener('keydown', onKey)
    onClose?.()
  }
  const onKey = e => e.key === 'Escape' && close()
  document.addEventListener('keydown', onKey)
  const rebuild = () => clear(panel, build(close, rebuild))
  rebuild()
  document.body.append(backdrop)
  return {close, rebuild}
}

export function sheetHeader(title, close, ...extra) {
  return h('div', {class: 'sheet-head'}, h('h2', null, title), ...extra, h('button', {class: 'btn ghost icon', 'aria-label': 'Close', onclick: close}, '✕'))
}

export function confirmDialog({title, message, confirm = 'OK', cancel = 'Cancel', danger = false, extra}) {
  return new Promise(resolve => {
    let answered = false
    const finish = v => {
      if (answered) return
      answered = true
      s.close()
      resolve(v)
    }
    const s = sheet(
      () =>
        h('div', {class: 'dialog'},
          h('h2', null, title),
          message && h('p', null, message),
          h('div', {class: 'row end gap'},
            extra && h('button', {class: 'btn', onclick: () => finish('extra')}, extra),
            h('button', {class: 'btn', onclick: () => finish(false)}, cancel),
            h('button', {class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => finish(true)}, confirm)
          )
        ),
      {onClose: () => finish(false)}
    )
  })
}

export function promptDialog({title, label, value = '', confirm = 'Save'}) {
  return new Promise(resolve => {
    let answered = false
    const input = h('input', {class: 'input', value, 'aria-label': label})
    const finish = v => {
      if (answered) return
      answered = true
      s.close()
      resolve(v)
    }
    const s = sheet(
      () =>
        h('form', {class: 'dialog', onsubmit: e => {
          e.preventDefault()
          finish(input.value.trim())
        }},
          h('h2', null, title),
          h('label', {class: 'field'}, h('span', null, label), input),
          h('div', {class: 'row end gap'},
            h('button', {type: 'button', class: 'btn', onclick: () => finish(null)}, 'Cancel'),
            h('button', {type: 'submit', class: 'btn primary'}, confirm)
          )
        ),
      {onClose: () => finish(null)}
    )
    setTimeout(() => input.focus(), 50)
  })
}

// ---------- files ----------

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
  const a = h('a', {href: URL.createObjectURL(blob), download: filename})
  document.body.append(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

export function pickJson() {
  return new Promise((resolve, reject) => {
    const input = h('input', {type: 'file', accept: 'application/json,.json', style: {display: 'none'}})
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      input.remove()
      if (!file) return resolve(null)
      try {
        resolve(JSON.parse(await file.text()))
      } catch (err) {
        reject(new Error('That file is not valid JSON.'))
      }
    })
    document.body.append(input)
    input.click()
  })
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')

// ---------- time ----------

export function age(ts, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export const clock = ts => new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})

export function dayLabel(ts) {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'})
}
