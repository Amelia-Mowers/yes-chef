// Settings for both roles.

import {h, clear, confirmDialog, promptDialog, toast, downloadJson, pickJson, stamp, sheet, sheetHeader} from '../ui.js'
import {state, changeSettings, regenerateRoom, exportAll, importAll, clearHistory, setLocal, resetRole, unpairKitchen, renameKitchen} from '../store.js'
import {shortCode, pairingUrl, via} from '../net.js'
import {DEFAULT_SETTINGS} from '../log.js'
import {qrcode} from '../../vendor/qr.js'
import {wakeLockOn, applyWakeLock} from '../wake.js'
import {THEMES, getTheme, setTheme} from '../theme.js'
import {BUILD} from '../version.js'
import {license, licenseStatus, onLicense, GRACE_MS, ENFORCE} from '../license.js'
import {backupNow, listCloudBackups, restoreCloudBackup, lastCloudBackup, deleteCloudData} from '../cloud.js'
import {checkForUpdate} from '../update.js'

function qrSvg(text) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({cellSize: 6, margin: 2, scalable: true})
}

function viaText() {
  return {relay: 'Connecting through the Yes Chef relay.', 'relay+public': 'Listening on the Yes Chef relay and public relays.', public: 'Connecting through public relays (the Yes Chef relay wasn’t reachable).'}[via] || ''
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

const when = ts => new Date(ts).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})

function subscriptionSection() {
  const box = h('section', {class: 'panel'})
  const fill = async () => {
    const st = licenseStatus()
    const last = await lastCloudBackup()
    const rows = []
    if (st === 'none') {
      rows.push(h('p', null, ENFORCE ? 'This tablet has no subscription yet.' : 'Yes Chef is free in the browser during early access. Subscriptions and cloud backup come with the Android app.'))
    } else if (st === 'moved') {
      rows.push(h('p', null, `Your subscription moved to ${license.movedTo || 'another tablet'}. This tablet is no longer the head for it.`))
    } else if (st === 'lapsed') {
      rows.push(h('p', null, 'Your subscription has ended.'))
    } else {
      rows.push(h('p', null, '● Subscription active. This tablet is the head.'))
      if (st === 'grace') rows.push(h('p', {class: 'muted small'}, `Couldn’t reach Yes Chef recently. Everything keeps working offline until ${when(license.claims.exp + GRACE_MS)}.`))
      rows.push(
        h('h3', null, 'Cloud backup'),
        h('p', {class: 'muted small'}, last ? `Last backup ${when(last)}. Backs up daily and before every publish or import.` : 'Backs up daily and before every publish or import.'),
        h('div', {class: 'row gap wrap'},
          h('button', {class: 'btn', onclick: async e => {
            e.currentTarget.disabled = true
            try {
              await backupNow('manual')
              toast('Backed up to the cloud')
            } catch (err) {
              toast(`Backup failed: ${err.message}`)
            }
            fill()
          }}, 'Back up now'),
          h('button', {class: 'btn', onclick: openCloudRestore}, 'Restore from cloud')
        ),
        h('p', {class: 'small'},
          h('button', {class: 'btn small danger', onclick: async () => {
            const ok = await confirmDialog({
              title: 'Delete your cloud data?',
              message: 'This erases all cloud backups and your subscription record from Yes Chef’s servers. Orders and menus on your tablets stay. Your Google Play subscription keeps running until you cancel it in Google Play; use Restore purchase to connect it again.',
              confirm: 'Delete cloud data',
              danger: true
            })
            if (!ok) return
            try {
              const r = await deleteCloudData()
              toast(`Deleted ${r.backups} cloud backup${r.backups === 1 ? '' : 's'} and your subscription record.`, {duration: 6000})
            } catch (err) {
              toast(`Couldn’t delete: ${err.message}`)
            }
          }}, 'Delete my cloud data'),
          ' ',
          h('a', {href: 'https://yes-chef.win/delete-data', target: '_blank', rel: 'noopener'}, 'What gets deleted')
        )
      )
    }
    box.replaceChildren(h('h2', null, 'Subscription'), ...rows)
  }
  fill()
  const off = onLicense(() => (box.isConnected ? fill() : off()))
  return box
}

async function openCloudRestore() {
  let list
  try {
    list = await listCloudBackups()
  } catch (err) {
    return toast(`Couldn’t load cloud backups: ${err.message}`)
  }
  sheet(close =>
    h('div', null,
      sheetHeader('Restore from cloud', close),
      list.length === 0 && h('p', null, 'No cloud backups yet.'),
      h('ul', {class: 'edit-list'}, list.map(b =>
        h('li', null,
          h('div', {class: 'edit-main static'}, h('strong', null, when(b.createdAt)), h('small', {class: 'muted'}, ` · ${b.reason} · from ${b.deviceName || 'head'}`)),
          h('button', {class: 'btn small danger', onclick: async () => {
            if (!(await confirmDialog({title: 'Restore this backup?', message: 'Menu, settings and history on this tablet are replaced (a local backup of now is taken first). Kitchens resync.', confirm: 'Restore', danger: true}))) return
            await restoreCloudBackup(b.id)
            toast('Restored from the cloud')
            close()
          }}, 'Restore')
        )
      ))
    ),
    {wide: true}
  )
}

function aboutSection() {
  return h('section', {class: 'panel'},
    h('h2', null, 'App version'),
    h('p', {class: 'muted'}, `Yes Chef ${BUILD}. New versions install in the background; you'll be offered a reload.`),
    h('p', {class: 'small'}, h('a', {href: 'https://yes-chef.win/privacy', target: '_blank', rel: 'noopener'}, 'Privacy policy'), ' · ', h('a', {href: 'mailto:support@yes-chef.win'}, 'support@yes-chef.win')),
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
        h('p', {class: 'muted small'}, viaText()),
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
      subscriptionSection(),
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
        h('p', {class: 'muted small'}, viaText()),
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
