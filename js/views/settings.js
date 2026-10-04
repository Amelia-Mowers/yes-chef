// Settings for both roles.

import {h, clear, confirmDialog, promptDialog, toast, downloadJson, pickJson, stamp} from '../ui.js'
import {state, changeSettings, regenerateRoom, exportAll, importAll, clearHistory, setLocal, resetRole, unpairKitchen, renameKitchen} from '../store.js'
import {shortCode, pairingUrl} from '../net.js'
import {DEFAULT_SETTINGS} from '../log.js'
import {qrcode} from '../../vendor/qr.js'
import {wakeLockOn, applyWakeLock} from '../wake.js'
import {THEMES, getTheme, setTheme} from '../theme.js'
import {agent, initAgent} from '../sheffield/agent.js'
import {MODELS} from '../sheffield/models.js'
import {dismissSheffield} from './sheffield.js'

function qrSvg(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({cellSize: 6, margin: 2, scalable: true})
}

function toggle(label, on, onchange, hint) {
  return h('label', {class: 'toggle'},
    h('input', {type: 'checkbox', checked: on, onchange: e => onchange(e.target.checked)}),
    h('span', {class: 'toggle-ui'}),
    h('span', null, label, hint && h('small', {class: 'muted block'}, hint))
  )
}

function screenSection() {
  const seg = h('div', {class: 'seg'})
  const renderSeg = () =>
    clear(seg, THEMES.map(([value, label]) =>
      h('button', {class: 'seg-btn' + (getTheme() === value ? ' on' : ''), 'aria-pressed': String(getTheme() === value), onclick: () => {
        setTheme(value)
        renderSeg()
      }}, label)
    ))
  renderSeg()
  return h('section', {class: 'panel'},
    h('h2', null, 'Screen'),
    h('div', {class: 'field'}, h('span', null, 'Appearance'), seg),
    toggle('Keep screen awake', wakeLockOn(), async v => {
      await setLocal({wakeLock: v})
      applyWakeLock()
    }, 'Stops the tablet sleeping and dropping the connection.')
  )
}

function sheffieldSection(render) {
  const box = h('section', {class: 'panel'}, h('h2', null, 'Sheffield'))
  const fill = () => {
    const tier = agent.tier && MODELS[agent.tier]
    box.replaceChildren(
      h('h2', null, h('img', {class: 'sf-avatar inline', src: 'icons/sheffield.svg', alt: ''}), ' Sheffield'),
      tier
        ? [
            h('p', null, `${tier.label} is hired on this tablet.`),
            agent.device && h('p', {class: 'muted small'}, `Running on ${agent.device === 'webgpu' ? 'the GPU' : 'the CPU (slow)'}${agent.precision ? `, ${agent.precision}` : ''}.`),
            h('p', {class: 'muted small'}, 'Qwen3.5, Apache-2.0 licence. ', h('a', {href: tier.licenseUrl, target: '_blank', rel: 'noopener'}, 'Licence text')),
            h('button', {class: 'btn danger', onclick: async () => {
              if (!(await confirmDialog({title: 'Dismiss Sheffield?', message: 'The model is deleted from this tablet. Menus and orders are not touched. You can hire Sheffield again later.', confirm: 'Dismiss', danger: true}))) return
              await dismissSheffield()
              render()
            }}, 'Dismiss Sheffield')
          ]
        : h('p', {class: 'muted'}, 'Not hired. Open Menu → Ask Sheffield to hire the on-device menu butler, or use “Copy assistant instructions” with any chat assistant.')
    )
  }
  if (agent.status === 'unknown') initAgent().then(fill)
  fill()
  return box
}

function roleSection() {
  return h('section', {class: 'panel'},
    h('h2', null, 'Device role'),
    h('p', {class: 'muted'}, `This device is the ${state.role === 'head' ? 'head (order taking)' : 'kitchen'} device. Data on it is kept.`),
    h('button', {class: 'btn', onclick: async () => {
      if (await confirmDialog({title: 'Switch role?', message: 'You will pick Head or Kitchen again.', confirm: 'Switch'})) resetRole()
    }}, 'Switch role')
  )
}

export function settingsView() {
  const el = h('div', {class: 'settings-screen'})

  function renderHead() {
    const statuses = {...DEFAULT_SETTINGS.statuses, ...state.settings.statuses}
    const setStatus = async (k, v) => {
      await changeSettings({...state.settings, statuses: {...statuses, [k]: v, done: true}})
      render()
    }
    const code = shortCode(state.room, state.secret)
    const kitchens = [...state.kitchens.values()]

    clear(el,
      h('section', {class: 'panel'},
        h('h2', null, 'Kitchen statuses'),
        h('p', {class: 'muted'}, 'The buttons kitchens see on each ticket.'),
        toggle('Started', statuses.started, v => setStatus('started', v)),
        toggle('Done', true, () => {}, 'Always on'),
        toggle('Picked up', statuses.pickedup, v => setStatus('pickedup', v), 'Tickets stay on screen after Done until picked up.')
      ),
      h('section', {class: 'panel pairing'},
        h('h2', null, 'Pair a kitchen'),
        h('div', {class: 'qr', html: qrSvg(pairingUrl(state.room, state.secret))}),
        h('p', null, 'In the kitchen tablet’s Yes Chef app, choose Kitchen and scan this code. Or type:'),
        h('p', {class: 'code mono'}, code),
        h('h3', null, `Connected kitchens (${kitchens.length})`),
        kitchens.length ? h('ul', {class: 'plain'}, kitchens.map(k => h('li', null, '● ', k.name))) : h('p', {class: 'muted'}, 'None right now.'),
        h('button', {class: 'btn danger', onclick: async () => {
          if (!(await confirmDialog({title: 'Regenerate room code?', message: 'Every kitchen will need to pair again.', confirm: 'Regenerate', danger: true}))) return
          await regenerateRoom()
          render()
        }}, 'Regenerate room code')
      ),
      h('section', {class: 'panel'},
        h('h2', null, 'Data'),
        h('p', {class: 'muted'}, `${state.events.length} event${state.events.length === 1 ? '' : 's'} in history. Data lives only on this tablet, so export regularly.`),
        h('div', {class: 'row gap wrap'},
          h('button', {class: 'btn primary', onclick: () => {
            downloadJson(exportAll(), `yes-chef-backup-${stamp()}.json`)
          }}, 'Export everything'),
          h('button', {class: 'btn', onclick: async () => {
            let data
            try {
              data = await pickJson()
            } catch (err) {
              return toast(err.message)
            }
            if (!data) return
            if (!Array.isArray(data.events)) return toast('That file is not a full Yes Chef backup. Import menus from the menu designer.')
            if (!(await confirmDialog({title: 'Import backup?', message: `This replaces the menu, settings and history (${data.events.length} events). A backup is taken first.`, confirm: 'Replace everything', danger: true}))) return
            await importAll(data)
            toast('Backup imported')
            render()
          }}, 'Import'),
          h('button', {class: 'btn danger', onclick: async () => {
            const answer = await confirmDialog({title: 'Clear all history?', message: 'Every order and event is removed from this tablet and from kitchens. A backup is taken first.', confirm: 'Clear history', extra: 'Export first', danger: true})
            if (answer === 'extra') downloadJson(exportAll(), `yes-chef-backup-${stamp()}.json`)
            if (answer === true) {
              await clearHistory()
              toast('History cleared')
              render()
            }
          }}, 'Clear history')
        )
      ),
      sheffieldSection(render),
      screenSection(),
      roleSection()
    )
  }

  function renderKitchen() {
    const p = state.pairing
    clear(el,
      h('section', {class: 'panel'},
        h('h2', null, 'This kitchen'),
        h('p', null, h('strong', null, p?.name || 'Kitchen'), ' ',
          h('button', {class: 'btn small', onclick: async () => {
            const name = await promptDialog({title: 'Rename kitchen', label: 'Name', value: p?.name})
            if (name) {
              await renameKitchen(name)
              render()
            }
          }}, 'Rename')
        ),
        h('p', null, state.headPeer ? '● Connected to the head device' : '○ Head device not reachable'),
        p && h('p', {class: 'muted mono'}, `Room ${p.room}`),
        h('button', {class: 'btn danger', onclick: async () => {
          if (await confirmDialog({title: 'Unpair this kitchen?', message: 'Tickets are removed from this tablet until you pair again.', confirm: 'Unpair', danger: true})) unpairKitchen()
        }}, 'Unpair')
      ),
      screenSection(),
      roleSection()
    )
  }

  const render = () => (state.role === 'head' ? renderHead() : renderKitchen())
  render()

  // Re-render only when connection details change, so toggles don't flicker.
  let sig = ''
  const signature = () => `${state.room}|${state.kitchens.size}|${[...state.kitchens.values()].map(k => k.name)}|${state.headPeer}|${state.events.length}`
  sig = signature()
  return {
    el,
    update() {
      const next = signature()
      if (next !== sig) {
        sig = next
        render()
      }
    }
  }
}
