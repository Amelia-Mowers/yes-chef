// Settings for both roles.

import {h, clear, confirmDialog, promptDialog, toast, downloadJson, pickJson, stamp} from '../ui.js'
import {state, changeSettings, regenerateRoom, exportAll, importAll, clearHistory, setLocal, resetRole, unpairKitchen, renameKitchen} from '../store.js'
import {shortCode, pairingUrl} from '../net.js'
import {DEFAULT_SETTINGS} from '../log.js'
import {qrcode} from '../../vendor/qr.js'
import {wakeLockOn, applyWakeLock} from '../wake.js'

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

function wakeLockSection() {
  return h('section', {class: 'panel'},
    h('h2', null, 'Screen'),
    toggle('Keep screen awake', wakeLockOn(), async v => {
      await setLocal({wakeLock: v})
      applyWakeLock()
    }, 'Stops the tablet sleeping and dropping the connection.')
  )
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
      wakeLockSection(),
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
      wakeLockSection(),
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
