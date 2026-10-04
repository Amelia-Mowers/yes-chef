// Sheffield: a guide for building the menu with your own chat assistant.
// Copy or download the instructions, chat, then import the menu.json.

import {h, sheet, sheetHeader, toast, pickJson, confirmDialog} from '../ui.js'
import {state, importMenuToDraft} from '../store.js'
import {assistantInstructions, copyText, downloadText, normalizeMenu} from '../sheffield/instructions.js'

const AVATAR = 'icons/sheffield.svg'

export function openSheffield({onImported} = {}) {
  const hasMenu = Boolean(state.menuDraft?.categories?.length)
  let includeMenu = hasMenu
  const text = () => assistantInstructions(includeMenu ? state.menuDraft : null)

  sheet((close, rebuild) =>
    h('div', {class: 'sf'},
      sheetHeader('Sheffield', close),
      h('div', {class: 'sf-intro'},
        h('img', {class: 'sf-avatar', src: AVATAR, alt: 'Sheffield, a little butler with a monocle and bow tie'}),
        h('div', {class: 'sf-bubble'},
          'Good day. I work through whichever chat assistant you already use: ChatGPT, Claude, Gemini, or another. Hand it my instructions with photos or files of your menu, answer my questions, and I shall return a menu file for you to import.'
        )
      ),
      h('ol', {class: 'sf-steps'},
        h('li', null, h('strong', null, 'Copy or download my instructions'), ' using the buttons below.'),
        h('li', null, h('strong', null, 'Open your assistant'), ', paste them, and attach photos of the menu, a PDF, or a spreadsheet.'),
        h('li', null, h('strong', null, 'Answer my questions'), ' about anything unclear, such as which section a dish belongs in.'),
        h('li', null, h('strong', null, 'Save the menu.json'), ' I give you, then tap ', h('em', null, 'Import menu.json'), '. It lands in the menu designer as a draft; nothing is published until you say so.')
      ),
      hasMenu && h('label', {class: 'toggle'},
        h('input', {type: 'checkbox', checked: includeMenu, onchange: e => {
          includeMenu = e.target.checked
          rebuild()
        }}),
        h('span', {class: 'toggle-ui'}),
        h('span', null, 'Include my current menu', h('small', {class: 'muted block'}, 'So Sheffield edits it instead of starting fresh.'))
      ),
      h('div', {class: 'row gap wrap sf-actions'},
        h('button', {class: 'btn primary big', onclick: async () => {
          const ok = await copyText(text())
          toast(ok ? 'Instructions copied. Paste them into your assistant.' : 'Couldn’t copy; your browser blocked the clipboard. Try Download instead.', {duration: 5000})
        }}, 'Copy instructions'),
        h('button', {class: 'btn big', onclick: () => downloadText(text(), 'sheffield-instructions.txt')}, 'Download instructions'),
        h('button', {class: 'btn big', onclick: () => importFile(close)}, 'Import menu.json')
      ),
      h('details', {class: 'sf-preview'},
        h('summary', null, 'Read the instructions'),
        h('pre', null, text())
      ),
      h('p', {class: 'muted small'}, 'Your photos and menu go to the assistant you choose, under its own terms. Yes Chef itself sends nothing anywhere.')
    ),
    {wide: true}
  )

  async function importFile(close) {
    let data
    try {
      data = await pickJson()
    } catch (err) {
      return toast(err.message)
    }
    if (!data) return
    const result = normalizeMenu(data)
    if (result.error) return toast(result.error, {duration: 6000})
    const {categories, items, groups} = result.counts
    const ok = await confirmDialog({
      title: 'Load this menu into the designer?',
      message: `${categories} categor${categories === 1 ? 'y' : 'ies'}, ${items} item${items === 1 ? '' : 's'}, ${groups} choice group${groups === 1 ? '' : 's'}. ${
        result.fixes.length ? `Tidied up: ${result.fixes.slice(0, 4).join('; ')}${result.fixes.length > 4 ? `; and ${result.fixes.length - 4} more` : ''}. ` : ''
      }Your current draft is backed up first; the live menu doesn’t change until you publish.`,
      confirm: 'Load menu'
    })
    if (!ok) return
    await importMenuToDraft(result.menu)
    close()
    toast('Very good. The new draft is in the menu designer; publish when ready.', {duration: 5000})
    onImported?.()
  }
}
