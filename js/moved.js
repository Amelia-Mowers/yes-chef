// The app moved from GitHub Pages to its own domain. On the old address, show a
// banner once the new one is reachable (so it never points at a dead link).
// Browser data is per address, so people export here and import there.

import {h} from './ui.js'
import {exportAll, state} from './store.js'
import {downloadJson, stamp} from './ui.js'

export const NEW_HOME = 'https://app.yes-chef.win/'
const OLD_HOSTS = ['amelia-mowers.github.io']

export async function announceMove() {
  if (!OLD_HOSTS.includes(location.hostname)) return
  try {
    // no-cors resolves (opaquely) when the site answers, rejects when it doesn't.
    await fetch(NEW_HOME + 'manifest.webmanifest', {mode: 'no-cors', cache: 'no-store'})
  } catch {
    return
  }
  document.body.append(
    h('div', {class: 'update-banner moved', role: 'status'},
      state.role === 'head'
        ? [
            h('span', null, 'Yes Chef has moved to app.yes-chef.win. Export your data here, then import it there.'),
            h('button', {class: 'btn small', onclick: () => downloadJson(exportAll(), `yes-chef-backup-${stamp()}.json`)}, 'Export everything')
          ]
        : h('span', null, 'Yes Chef has moved to app.yes-chef.win. Open it there and pair this tablet again.'),
      h('a', {class: 'btn primary small', href: NEW_HOME}, 'Open new address')
    )
  )
}
