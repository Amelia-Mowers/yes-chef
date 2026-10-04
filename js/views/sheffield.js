// Sheffield's chat sheet: conversation, attachments, live menu preview, hiring.

import {h, clear, sheet, toast, confirmDialog} from '../ui.js'
import {state, importMenuToDraft} from '../store.js'
import {createSession} from '../sheffield/session.js'
import {agent, onAgent, initAgent, hire, dismiss, storageFor, isInstalled, devicePath, cancel} from '../sheffield/agent.js'
import {MODELS} from '../sheffield/models.js'
import {assistantInstructions, copyText} from '../sheffield/handoff.js'
import {say} from '../sheffield/voice.js'

const AVATAR = 'icons/sheffield.svg'
const mb = bytes => `${Math.round(bytes / 1e6)} MB`
const gb = megabytes => (megabytes >= 1000 ? `${(megabytes / 1000).toFixed(1)} GB` : `${megabytes} MB`)

let session = null
// The session outlives any one sheet, so it renders through this hook.
let renderChat = () => {}

export async function copyInstructions() {
  const ok = await copyText(assistantInstructions(state.menuDraft))
  toast(ok ? 'Instructions copied. Paste them into any chat assistant, then import the menu.json it gives you.' : 'Couldn’t copy. Your browser blocked the clipboard.', {duration: 6000})
}

let path = null

export async function openSheffield({onApplied} = {}) {
  if (agent.status === 'unknown') await initAgent()
  path ??= await devicePath()
  let pendingFiles = []
  let hireBox = null
  let statusEl = null

  if (!session) {
    session = createSession(state.menuDraft, () => renderChat())
    await session.restore()
  }

  const s = sheet((close, rebuild) => {
    const st = session.state
    const messages = h('div', {class: 'sf-messages', role: 'log', 'aria-live': 'polite'})
    const preview = h('div', {class: 'sf-preview'})
    const fileInput = h('input', {type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,image/heic,.csv,.txt,.json,text/plain,text/csv,application/json,application/pdf', hidden: true, onchange: () => {
      pendingFiles = [...pendingFiles, ...fileInput.files]
      fileInput.value = ''
      renderComposer()
    }})
    const textarea = h('textarea', {class: 'input sf-input', rows: 1, placeholder: 'Message Sheffield, or paste a menu…', 'aria-label': 'Message Sheffield', oninput: e => autoGrow(e.target), onkeydown: e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        send()
      }
    }})
    const fileChips = h('div', {class: 'sf-files'})
    const sendBtn = h('button', {class: 'btn primary', onclick: send}, 'Send')
    const composer = h('div', {class: 'sf-composer'},
      fileChips,
      h('div', {class: 'row gap'},
        h('button', {class: 'btn icon', 'aria-label': 'Attach photos or files', title: 'Attach photos or files', onclick: () => fileInput.click()}, '📎'),
        textarea,
        sendBtn,
        fileInput
      )
    )
    hireBox = h('div')
    statusEl = h('div', {class: 'muted small'}, statusLine())

    function renderComposer() {
      clear(fileChips, pendingFiles.map((f, i) =>
        h('span', {class: 'chip small'}, f.name, h('button', {class: 'btn ghost small', 'aria-label': `Remove ${f.name}`, onclick: () => {
          pendingFiles.splice(i, 1)
          renderComposer()
        }}, '✕'))
      ))
      sendBtn.disabled = st.busy
    }

    async function send(textOverride) {
      const text = typeof textOverride === 'string' ? textOverride : textarea.value
      if (!text.trim() && !pendingFiles.length) return
      const files = pendingFiles
      pendingFiles = []
      if (typeof textOverride !== 'string') {
        textarea.value = ''
        autoGrow(textarea)
      }
      renderComposer()
      await session.send({text, files})
    }

    function renderMessages() {
      clear(messages, st.messages.map(m =>
        m.from === 'user'
          ? h('div', {class: 'sf-msg user'},
              m.thumbs?.filter(Boolean).map(src => h('img', {class: 'sf-thumb', src, alt: 'Attached photo'})),
              m.files?.length > 0 && !m.thumbs?.length && h('div', {class: 'muted small'}, '📎 ', m.files.join(', ')),
              m.text && h('div', {class: 'sf-bubble'}, m.text))
          : h('div', {class: 'sf-msg sheffield'},
              h('img', {class: 'sf-avatar', src: AVATAR, alt: ''}),
              h('div', {class: 'sf-body'},
                m.transcript
                  ? h('details', {class: 'sf-bubble'}, h('summary', null, 'Here is what I read'), h('pre', null, m.text.replace(/^Here is what I read:\n/, '')))
                  : m.text && h('div', {class: 'sf-bubble'}, m.text),
                m.problems?.length > 0 && h('div', {class: 'sf-problems'}, m.problems.map(p => h('div', null, '⚠ ', p))),
                m.hire && !isInstalled() && h('button', {class: 'btn small', onclick: () => {
                  hireBox.dataset.open = '1'
                  renderHire(hireBox)
                  hireBox.scrollIntoView({behavior: 'smooth'})
                }}, 'See hiring options'),
                m.choices?.length > 0 && m === lastQuestion() && h('div', {class: 'chips sf-choices'}, m.choices.map(c =>
                  h('button', {class: 'chip', disabled: st.busy, onclick: () => send(m.fromModel ? `${m.text} ${c}` : c)}, c)
                )),
                m.stats && h('div', {class: 'sf-stats muted'}, `${m.stats.tokensPerSec ?? '–'} tokens/s · first word ${(m.stats.firstTokenMs / 1000).toFixed(1)}s`)
              ))
      ))
      if (st.busy) {
        const live = st.streaming && !st.streaming.trimStart().startsWith('{') && !st.streaming.trimStart().startsWith('`') ? st.streaming : null
        messages.append(h('div', {class: 'sf-msg sheffield'},
          h('img', {class: 'sf-avatar thinking', src: AVATAR, alt: ''}),
          h('div', {class: 'sf-body'},
            h('div', {class: 'sf-bubble sf-typing'}, live ? h('pre', null, live) : h('span', {class: 'dots'}, say.thinking)),
            isInstalled() && h('button', {class: 'btn small ghost', onclick: cancel}, 'Stop')
          )
        ))
      }
      requestAnimationFrame(() => (messages.scrollTop = messages.scrollHeight))
    }

    function lastQuestion() {
      for (let i = st.messages.length - 1; i >= 0; i--) {
        const m = st.messages[i]
        if (m.from === 'user') return null
        if (m.choices?.length) return m
      }
      return null
    }

    function renderPreview() {
      const m = st.working
      const groups = new Map(m.modifierGroups.map(g => [g.id, g]))
      const draftJson = JSON.stringify(state.menuDraft)
      const changed = JSON.stringify(m) !== draftJson
      clear(preview,
        h('div', {class: 'sf-preview-head'},
          h('h3', null, 'Proposed menu'),
          h('button', {class: 'btn primary small', disabled: !changed || !m.categories.length, onclick: apply}, 'Use this menu')
        ),
        !m.categories.length && h('p', {class: 'muted'}, 'Nothing yet.'),
        m.categories.map(c =>
          h('section', {class: 'sf-cat', style: {'--cat': c.color}},
            h('h4', null, c.name),
            h('ul', null, c.items.map(i =>
              h('li', null, i.name, i.modifierGroups.length > 0 && h('small', {class: 'muted'}, ' · ', i.modifierGroups.map(id => groups.get(id)?.name).filter(Boolean).join(', ')))
            ))
          )
        ),
        m.modifierGroups.length > 0 && h('section', {class: 'sf-groups'},
          h('h4', null, 'Choices'),
          h('ul', null, m.modifierGroups.map(g =>
            h('li', null, h('strong', null, g.name), h('small', {class: 'muted'}, ` (${g.select === 'single' ? 'pick one' : 'pick any'}${g.required ? ', required' : ''})`), ': ', g.options.map(o => o.name).join(', '))
          ))
        )
      )
    }

    async function apply() {
      await importMenuToDraft(structuredClone(st.working))
      session.applied()
      toast('Menu draft updated. Publish it from the menu designer.')
      onApplied?.()
    }

    renderChat = () => {
      renderMessages()
      renderPreview()
      renderComposer()
      renderHire(hireBox)
    }

    renderChat()
    setTimeout(() => textarea.focus(), 80)

    return h('div', {class: 'sf'},
      h('div', {class: 'sheet-head sf-head'},
        h('img', {class: 'sf-avatar big', src: AVATAR, alt: ''}),
        h('div', {class: 'grow'}, h('h2', null, 'Sheffield'), statusEl),
        h('button', {class: 'btn small', onclick: copyInstructions, title: 'Use ChatGPT, Claude or any assistant to make a menu file'}, 'Copy assistant instructions'),
        h('button', {class: 'btn small ghost', onclick: async () => {
          if (await confirmDialog({title: 'Start a new conversation?', message: 'The proposed menu resets to your current draft.', confirm: 'Start over'})) {
            await session.reset(state.menuDraft)
            rebuild()
          }
        }}, 'Start over'),
        h('button', {class: 'btn ghost icon', 'aria-label': 'Close', onclick: close}, '✕')
      ),
      h('div', {class: 'sf-grid'},
        h('div', {class: 'sf-chat'}, hireBox, messages, composer),
        preview
      )
    )
  }, {wide: true, onClose: () => {
    offAgent()
    renderChat = () => {}
  }})

  const offAgent = onAgent(() => {
    renderHire(hireBox)
    if (statusEl) statusEl.textContent = statusLine()
  })
  return s
}

function statusLine() {
  const tier = agent.tier && MODELS[agent.tier]
  switch (agent.status) {
    case 'ready':
      return `${tier.label} · on this tablet${agent.device === 'webgpu' ? '' : ' (slow mode, no GPU)'}`
    case 'installed':
      return `${tier.label} · wakes when needed`
    case 'downloading':
    case 'loading':
      return 'Getting ready…'
    case 'error':
      return 'Unwell'
    default:
      return 'Menu butler · pasting and files work without hiring'
  }
}

function renderHire(box) {
  if (!box) return
  const status = agent.status
  if (status === 'ready' || status === 'installed') return clear(box)
  if (status === 'downloading' || status === 'loading') {
    const {loaded, total} = agent.progress
    const pct = total ? Math.min(100, (loaded / total) * 100) : 0
    return clear(box,
      h('div', {class: 'sf-hire'},
        h('strong', null, total && loaded < total ? 'Sheffield is on the way…' : 'Sheffield is settling in…'),
        h('div', {class: 'progress'}, h('div', {class: 'progress-bar', style: {width: `${pct}%`}})),
        h('div', {class: 'muted small'}, total ? `${mb(loaded)} of ${mb(total)}` : 'Starting…', ' · Please keep Yes Chef open until this finishes.')
      )
    )
  }
  const memory = navigator.deviceMemory // Chrome only
  // Once the conversation is under way, the offer shrinks to one line.
  const started = session?.state.messages.some(m => m.from === 'user')
  if (started && !box.dataset.open && status !== 'error') {
    return clear(box, h('button', {class: 'sf-hire-strip', onclick: () => {
      box.dataset.open = '1'
      renderHire(box)
    }}, h('img', {class: 'sf-avatar inline', src: AVATAR, alt: ''}), 'Hire Sheffield to read menu photos ▸'))
  }
  clear(box,
    h('div', {class: 'sf-hire'},
      status === 'error' && h('p', {class: 'sf-problems'}, '⚠ ', /network|fetch|load failed/i.test(agent.error) ? say.interrupted : `${agent.error}. ${say.unsupported}`),
      h('strong', null, 'Hire Sheffield to read menu photos'),
      h('p', {class: 'muted small'}, 'One download, then it runs entirely on this tablet, offline. Nothing you send leaves the device.'),
      h('div', {class: 'sf-tiers'},
        Object.values(MODELS).filter(tier => tier.sizeMB[path]).map(tier => {
          const heavy = tier.id === '2b'
          return h('button', {class: 'sf-tier', onclick: () => startHire(tier.id)},
            h('strong', null, tier.label),
            h('span', null, `≈ ${gb(tier.sizeMB[path])}`),
            h('small', {class: 'muted'}, heavy ? `Reads photos better. For tablets with 8 GB+ memory${memory ? ` (this one reports ${memory} GB)` : ''}.` : 'Recommended for most tablets.')
          )
        })
      ),
      path === 'wasm' && h('p', {class: 'sf-problems'}, '⚠ This browser has no GPU access (WebGPU), so Sheffield would run on the processor: a bigger download and slow replies. iPads need iPadOS 26 or newer.'),
      h('p', {class: 'muted small'}, 'Model: Qwen3.5 (Apache-2.0), downloaded from Hugging Face. ', h('a', {href: MODELS['0.8b'].licenseUrl, target: '_blank', rel: 'noopener'}, 'Licence'))
    )
  )
}

async function startHire(tierId) {
  const {needMB, freeMB, enough} = await storageFor(tierId)
  if (!enough) {
    toast(`Not enough space: Sheffield needs about ${gb(needMB)}, and ${gb(freeMB)} is free.`, {duration: 6000})
    return
  }
  try {
    await navigator.storage?.persist?.()
  } catch {}
  try {
    await hire(tierId)
    session?.note(say.hired)
  } catch (err) {
    const network = /network|fetch|load failed|interrupted|offline/i.test(err.message)
    session?.note(network ? say.interrupted : `${say.unsupported} (${err.message})`)
  }
}

export async function dismissSheffield() {
  const freed = await dismiss()
  toast(say.dismissed(freed > 1e6 ? mb(freed) : ''), {duration: 6000})
}

function autoGrow(el) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}
