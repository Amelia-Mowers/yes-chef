// Kitchen first run: scan the head device's QR code, or type the short code.

import {h, toast} from '../ui.js'
import {pairKitchen, state, ROLE_LABEL} from '../store.js'
import {parsePairing} from '../net.js'
import {jsQR} from '../../vendor/qr.js'

export function pairView({prefill} = {}) {
  const video = h('video', {class: 'scan-video', playsinline: true, muted: true, autoplay: true})
  const canvas = h('canvas', {style: {display: 'none'}})
  const status = h('p', {class: 'muted'}, 'Point the camera at the QR code in the head device’s Settings.')
  const scanBox = h('div', {class: 'scan-box'}, video, h('div', {class: 'scan-frame'}))
  const codeInput = h('input', {class: 'input big mono', placeholder: 'XXXX-XXXX-XXXX-XXXX', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, value: prefill || '', 'aria-label': 'Pairing code'})
  const nameInput = h('input', {class: 'input big', value: ROLE_LABEL[state.role] || 'Kitchen', 'aria-label': state.role === 'taker' ? 'Device name' : 'Kitchen name'})
  const startBtn = h('button', {class: 'btn primary big', onclick: startScan}, 'Scan QR code')

  const el = h('div', {class: 'pair-screen'},
    h('h1', null, state.role === 'taker' ? 'Pair this order taker' : 'Pair this kitchen'),
    h('label', {class: 'field'}, h('span', null, state.role === 'taker' ? 'Device name' : 'Kitchen name'), nameInput),
    h('div', {class: 'pair-cols'},
      h('section', {class: 'panel'}, h('h2', null, 'Scan'), scanBox, status, startBtn),
      h('form', {class: 'panel', onsubmit: e => {
        e.preventDefault()
        tryPair(codeInput.value)
      }},
        h('h2', null, 'Or type the code'),
        h('p', {class: 'muted'}, 'Shown under the QR code on the head device.'),
        codeInput,
        h('button', {class: 'btn primary big', type: 'submit'}, 'Pair')
      )
    ),
    canvas
  )

  let stream = null
  let raf = 0
  let detector = null

  async function tryPair(text) {
    const parsed = parsePairing(text)
    if (!parsed) {
      toast('That code doesn’t look right. It has 16 letters and numbers.')
      return false
    }
    stop()
    await pairKitchen(parsed, nameInput.value.trim() || ROLE_LABEL[state.role])
    toast('Paired. Waiting for the head device…')
    return true
  }

  async function startScan() {
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'This browser can’t open the camera. Type the code instead.'
      return
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false})
    } catch {
      status.textContent = 'Camera access was blocked. Allow it in the browser settings, or type the code.'
      return
    }
    video.srcObject = stream
    await video.play().catch(() => {})
    scanBox.classList.add('live')
    startBtn.hidden = true
    status.textContent = 'Looking for a code…'
    if ('BarcodeDetector' in window) {
      try {
        detector = new window.BarcodeDetector({formats: ['qr_code']})
      } catch {}
    }
    tick()
  }

  async function tick() {
    if (!stream) return
    let text = null
    if (video.readyState >= 2) {
      if (detector) {
        try {
          const codes = await detector.detect(video)
          text = codes[0]?.rawValue || null
        } catch {
          detector = null
        }
      } else {
        const w = (canvas.width = video.videoWidth)
        const hgt = (canvas.height = video.videoHeight)
        const ctx = canvas.getContext('2d', {willReadFrequently: true})
        ctx.drawImage(video, 0, 0, w, hgt)
        const code = jsQR(ctx.getImageData(0, 0, w, hgt).data, w, hgt, {inversionAttempts: 'dontInvert'})
        text = code?.data || null
      }
    }
    if (text) {
      if (parsePairing(text)) return tryPair(text)
      status.textContent = 'That QR code isn’t a Yes Chef pairing code.'
    }
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach(t => t.stop())
    stream = null
  }

  return {el, update() {}, destroy: stop}
}

export function waitingView() {
  return {el: h('div', {class: 'empty'}, h('h2', null, 'Connecting to the head device…'), h('p', null, 'Make sure the head tablet has Yes Chef open and is on the same Wi-Fi.')), update() {}}
}

