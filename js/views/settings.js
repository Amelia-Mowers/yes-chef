// Settings for both roles.

import {h, clear, confirmDialog, promptDialog, toast, downloadJson, pickJson, stamp} from '../ui.js'
import {state, changeSettings, regenerateRoom, exportAll, importAll, clearHistory, setLocal, resetRole, unpairKitchen, renameKitchen} from '../store.js'
import {shortCode, pairingUrl} from '../net.js'
import {DEFAULT_SETTINGS} from '../log.js'
import {qrcode} from '../../vendor/qr.js'
import {wakeLockOn, applyWakeLock} from '../wake.js'
import {THEMES, getTheme, setTheme} from '../theme.js'
import {BUILD} from '../version.js'
import {checkForUpdate} from '../update.js'

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

function aboutSection() {
  return h('section', {class: 'panel'},
    h('h2', null, 'App version'),
    h('p', {class: 'muted'}, `Yes Chef ${BUILD}. New versions install in the background; you'll be offered a reload.`),
    h('button', {class: 'btn', onclick: async e => {
      const btn = e.currentTarget
      btn.disabled = true
      try {
        const found = await checkForUpdate()
        toast(found ? 'Downloading the new version…' : 'You’re on the latest version.')
      } catch {
        toast('Couldn’t check for updates. Are you online?')
      } finally {
        btn.disabled = false
      }
    }}, 'Check for updates')
  )
}

function roleSection() {
  return h('section', {class: 'panel'},
    h('h2', null, 'Device role'),
    h('p', {class: 'muted'}, `This device is ${{head: 'the head (order taking)', kitchen: 'a kitchen', taker: 'an order taker'}[state.role]} device. Data on it is kept.`),
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
    const devices = [...state.devices.values()]

    clear(el,
      h('section', {class: 'panel'},
        h('h2', null, 'Kitchen statuses'),
        h('p', {class: 'muted'}, 'The buttons kitchens see on each ticket.'),
        toggle('Started', statuses.started, v => setStatus('started', v)),
        toggle('Done', true, () => {}, 'Always on'),
        toggle('Picked up', statuses.pickedup, v => setStatus('pickedup', v), 'Tickets stay on screen after Done until picked up.')
      ),
      h('section', {class: 'panel pairing'},
        h('h2', null, 'Pair a device'),
        h('div', {class: 'qr', html: qrSvg(pairingUrl(state.room, state.secret))}),
        h('p', null, 'On another tablet, open Yes Chef, choose Kitchen or Order taker, and scan this code. Or type:'),
        h('p', {class: 'code mono'}, code),
        h('h3', null, `Connected devices (${devices.length})`),
        devices.length ? h('ul', {class: 'plain'}, devices.map(d => h('li', null, '● ', d.name, h('span', {class: 'muted'}, ` · ${d.role === 'taker' ? 'order taker' : 'kitchen'}`)))) : h('p', {class: 'muted'}, 'None right now.'),
        h('button', {class: 'btn danger', onclick: async () => {
          if (!(await confirmDialog({title: 'Regenerate room code?', message: 'Every kitchen and order taker will need to pair again.', confirm: 'Regenerate', danger: true}))) return
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
            const answer = await confirmDialog({title: 'Clear all history?', message: 'Every order and event is removed from this tablet and from paired devices. A backup is taken first.', confirm: 'Clear history', extra: 'Export first', danger: true})
            if (answer === 'extra') downloadJson(exportAll(), `yes-chef-backup-${stamp()}.json`)
            if (answer === true) {
              await clearHistory()
              toast('History cleared')
              render()
            }
          }}, 'Clear history')
        )
      ),
      screenSection(),
      aboutSection(),
      roleSection()
    )
  }

  function renderKitchen() {
    const p = state.pairing
    clear(el,
      h('section', {class: 'panel'},
        h('h2', null, state.role === 'taker' ? 'This order taker' : 'This kitchen'),
        h('p', null, h('strong', null, p?.name || 'Kitchen'), ' ',
          h('button', {class: 'btn small', onclick: async () => {
            const name = await promptDialog({title: state.role === 'taker' ? 'Rename this device' : 'Rename kitchen', label: 'Name', value: p?.name})
            if (name) {
              await renameKitchen(name)
              render()
            }
          }}, 'Rename')
        ),
        h('p', null, state.headPeer ? '● Connected to the head device' : '○ Head device not reachable'),
        p && h('p', {class: 'muted mono'}, `Room ${p.room}`),
        h('button', {class: 'btn danger', onclick: async () => {
          if (await confirmDialog({title: state.role === 'taker' ? 'Unpair this order taker?' : 'Unpair this kitchen?', message: 'Orders are removed from this tablet until you pair again.', confirm: 'Unpair', danger: true})) unpairKitchen()
        }}, 'Unpair')
      ),
      screenSection(),
      aboutSection(),
      roleSection()
    )
  }

  const render = () => (state.role === 'head' ? renderHead() : renderKitchen())
  render()

  // Re-render only when connection details change, so toggles don't flicker.
  let sig = ''
  const signature = () => `${state.room}|${state.devices.size}|${[...state.devices.values()].map(k => k.name)}|${state.headPeer}|${state.events.length}`
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
