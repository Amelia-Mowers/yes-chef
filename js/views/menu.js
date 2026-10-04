// Head device: build the menu, publish it, export/import, and restore backups.

import {h, clear, sheet, sheetHeader, confirmDialog, toast, downloadJson, pickJson, stamp, dayLabel, clock} from '../ui.js'
import {state, saveDraft, publishMenu, importMenuToDraft, importAll, listBackups, restoreBackup, exportAll, hasData, emptyMenu} from '../store.js'
import {SAMPLE_MENU} from '../sample-menu.js'
import {openSheffield, copyInstructions} from './sheffield.js'

const COLORS = ['#E07A5F', '#F2CC8F', '#81B29A', '#3D85C6', '#9C89B8', '#F28482', '#84A59D', '#E9C46A', '#6D6875', '#2A9D8F']
const id = p => `${p}_${crypto.randomUUID().slice(0, 8)}`

let selectedCat = null

function strip(menu) {
  if (!menu) return ''
  const {version, ...rest} = menu
  return JSON.stringify(rest)
}

function move(list, i, d) {
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
}

export function menuView() {
  const el = h('div', {class: 'menu-screen'})

  const draft = () => state.menuDraft || emptyMenu()
  const commit = async next => {
    await saveDraft(next)
    render()
  }

  function render() {
    const d = draft()
    if (!d.categories.find(c => c.id === selectedCat)) selectedCat = d.categories[0]?.id || null
    const cat = d.categories.find(c => c.id === selectedCat)
    const dirty = strip(d) !== strip(state.menu)

    clear(el,
      h('div', {class: 'menu-toolbar'},
        h('div', {class: 'grow'},
          h('strong', null, state.menu ? `Live: v${state.menu.version}` : 'Not published yet'),
          dirty ? h('span', {class: 'pill s-started'}, 'Unpublished changes') : state.menu && h('span', {class: 'pill s-done'}, 'Up to date')
        ),
        h('button', {class: 'btn sf-launch', onclick: () => openSheffield({onApplied: () => {
          selectedCat = null
          render()
        }})}, h('img', {src: 'icons/sheffield.svg', alt: ''}), 'Ask Sheffield'),
        h('button', {class: 'btn', onclick: copyInstructions, title: 'Copy a prompt for ChatGPT, Claude or any assistant; import the menu.json it returns'}, 'Copy assistant instructions'),
        h('button', {class: 'btn', onclick: loadTestMenu}, 'Load test menu'),
        h('button', {class: 'btn', onclick: () => downloadJson(state.menu || d, `yes-chef-menu-${stamp()}.json`)}, 'Export'),
        h('button', {class: 'btn', onclick: doImport}, 'Import'),
        h('button', {class: 'btn', onclick: openBackups}, 'Backups'),
        h('button', {class: 'btn primary', disabled: !dirty || !d.categories.length, onclick: doPublish}, 'Publish')
      ),
      h('div', {class: 'menu-cols'},
        h('section', {class: 'panel'},
          h('h2', null, 'Categories'),
          h('ul', {class: 'edit-list'}, d.categories.map((c, i) =>
            h('li', {class: c.id === selectedCat ? 'on' : ''},
              h('button', {class: 'edit-main', onclick: () => {
                selectedCat = c.id
                render()
              }}, h('span', {class: 'swatch', style: {background: c.color}}), c.name, h('small', {class: 'muted'}, ` ${c.items.length}`)),
              h('button', {class: 'btn ghost small', onclick: () => editCategory(i)}, 'Edit')
            )
          )),
          h('button', {class: 'btn full', onclick: () => editCategory(-1)}, '+ Category')
        ),
        h('section', {class: 'panel'},
          h('h2', null, cat ? `Items in ${cat.name}` : 'Items'),
          cat
            ? [
                h('ul', {class: 'edit-list'}, cat.items.map((it, i) =>
                  h('li', null,
                    h('button', {class: 'edit-main', onclick: () => editItem(cat.id, i)},
                      it.name,
                      it.modifierGroups.length > 0 && h('small', {class: 'muted'}, ' · ' + it.modifierGroups.map(g => d.modifierGroups.find(x => x.id === g)?.name).filter(Boolean).join(', '))
                    )
                  )
                )),
                h('button', {class: 'btn full', onclick: () => editItem(cat.id, -1)}, '+ Item')
              ]
            : h('p', {class: 'muted'}, 'Add a category first.')
        ),
        h('section', {class: 'panel'},
          h('h2', null, 'Modifier groups'),
          h('ul', {class: 'edit-list'}, d.modifierGroups.map((g, i) =>
            h('li', null,
              h('button', {class: 'edit-main', onclick: () => editGroup(i)},
                g.name,
                h('small', {class: 'muted'}, ` · ${g.select === 'single' ? 'single' : 'multi'}, ${g.required ? 'required' : 'optional'} · ${g.options.length} options`)
              )
            )
          )),
          h('button', {class: 'btn full', onclick: () => editGroup(-1)}, '+ Modifier group')
        )
      )
    )
  }

  // ---------- editors ----------

  function editCategory(index) {
    const d = structuredClone(draft())
    const isNew = index < 0
    const c = isNew ? {id: id('cat'), name: '', color: COLORS[d.categories.length % COLORS.length], items: []} : d.categories[index]
    sheet(close => {
      const name = h('input', {class: 'input big', value: c.name, placeholder: 'Burgers', oninput: e => (c.name = e.target.value), 'aria-label': 'Category name'})
      setTimeout(() => isNew && name.focus(), 50)
      return h('div', null,
        sheetHeader(isNew ? 'New category' : 'Edit category', close),
        h('label', {class: 'field'}, h('span', null, 'Name'), name),
        h('div', {class: 'field'}, h('span', null, 'Color'),
          h('div', {class: 'swatches'}, COLORS.map(col =>
            h('button', {class: 'swatch big' + (c.color === col ? ' on' : ''), style: {background: col}, 'aria-label': col, onclick: e => {
              c.color = col
              e.currentTarget.parentElement.querySelectorAll('.on').forEach(x => x.classList.remove('on'))
              e.currentTarget.classList.add('on')
            }})
          ))
        ),
        h('div', {class: 'row gap wrap'},
          !isNew && h('button', {class: 'btn', onclick: () => {
            move(d.categories, index, -1)
            commit(d)
            close()
          }}, '↑ Move up'),
          !isNew && h('button', {class: 'btn', onclick: () => {
            move(d.categories, index, 1)
            commit(d)
            close()
          }}, '↓ Move down'),
          h('div', {class: 'grow'}),
          !isNew && h('button', {class: 'btn danger', onclick: async () => {
            if (!(await confirmDialog({title: `Delete ${c.name}?`, message: `Its ${c.items.length} items go with it.`, confirm: 'Delete', danger: true}))) return
            d.categories.splice(index, 1)
            commit(d)
            close()
          }}, 'Delete'),
          h('button', {class: 'btn primary', onclick: () => {
            c.name = c.name.trim()
            if (!c.name) return toast('Give the category a name.')
            if (isNew) d.categories.push(c)
            selectedCat = c.id
            commit(d)
            close()
          }}, 'Save')
        )
      )
    })
  }

  function editItem(catId, index) {
    const d = structuredClone(draft())
    const cat = d.categories.find(c => c.id === catId)
    const isNew = index < 0
    const it = isNew ? {id: id('itm'), name: '', modifierGroups: []} : cat.items[index]
    sheet(close => {
      const name = h('input', {class: 'input big', value: it.name, placeholder: 'Classic Burger', oninput: e => (it.name = e.target.value), 'aria-label': 'Item name'})
      setTimeout(() => isNew && name.focus(), 50)
      return h('div', null,
        sheetHeader(isNew ? `New item in ${cat.name}` : 'Edit item', close),
        h('label', {class: 'field'}, h('span', null, 'Name'), name),
        h('div', {class: 'field'}, h('span', null, 'Modifier groups'),
          d.modifierGroups.length === 0 && h('p', {class: 'muted'}, 'No modifier groups yet. Add them in the right-hand column.'),
          h('div', {class: 'chips'}, d.modifierGroups.map(g => {
            const on = it.modifierGroups.includes(g.id)
            return h('button', {class: 'chip' + (on ? ' on' : ''), onclick: e => {
              if (it.modifierGroups.includes(g.id)) it.modifierGroups = it.modifierGroups.filter(x => x !== g.id)
              else it.modifierGroups.push(g.id)
              e.currentTarget.classList.toggle('on')
            }}, g.name)
          }))
        ),
        h('div', {class: 'row gap wrap'},
          !isNew && h('button', {class: 'btn', onclick: () => {
            move(cat.items, index, -1)
            commit(d)
            close()
          }}, '↑'),
          !isNew && h('button', {class: 'btn', onclick: () => {
            move(cat.items, index, 1)
            commit(d)
            close()
          }}, '↓'),
          !isNew && d.categories.length > 1 && h('select', {class: 'input', 'aria-label': 'Move to category', onchange: e => {
            const to = d.categories.find(c => c.id === e.target.value)
            cat.items.splice(index, 1)
            to.items.push(it)
            commit(d)
            close()
          }},
            h('option', {value: ''}, 'Move to…'),
            d.categories.filter(c => c.id !== cat.id).map(c => h('option', {value: c.id}, c.name))
          ),
          h('div', {class: 'grow'}),
          !isNew && h('button', {class: 'btn danger', onclick: () => {
            cat.items.splice(index, 1)
            commit(d)
            close()
          }}, 'Delete'),
          h('button', {class: 'btn primary', onclick: () => {
            it.name = it.name.trim()
            if (!it.name) return toast('Give the item a name.')
            if (isNew) cat.items.push(it)
            commit(d)
            close()
          }}, 'Save')
        )
      )
    })
  }

  function editGroup(index) {
    const d = structuredClone(draft())
    const isNew = index < 0
    const g = isNew ? {id: id('mg'), name: '', select: 'single', required: false, options: []} : d.modifierGroups[index]
    sheet((close, rebuild) =>
      h('div', null,
        sheetHeader(isNew ? 'New modifier group' : 'Edit modifier group', close),
        h('label', {class: 'field'}, h('span', null, 'Name'),
          h('input', {class: 'input big', value: g.name, placeholder: 'Temperature', oninput: e => (g.name = e.target.value), 'aria-label': 'Group name'})
        ),
        h('div', {class: 'row gap wrap'},
          h('div', {class: 'seg'},
            h('button', {class: 'seg-btn' + (g.select === 'single' ? ' on' : ''), onclick: () => {
              g.select = 'single'
              rebuild()
            }}, 'Pick one'),
            h('button', {class: 'seg-btn' + (g.select === 'multi' ? ' on' : ''), onclick: () => {
              g.select = 'multi'
              rebuild()
            }}, 'Pick many')
          ),
          h('div', {class: 'seg'},
            h('button', {class: 'seg-btn' + (g.required ? ' on' : ''), onclick: () => {
              g.required = true
              rebuild()
            }}, 'Required'),
            h('button', {class: 'seg-btn' + (!g.required ? ' on' : ''), onclick: () => {
              g.required = false
              rebuild()
            }}, 'Optional')
          )
        ),
        h('div', {class: 'field'}, h('span', null, 'Options'),
          h('ul', {class: 'opt-list'}, g.options.map((o, i) =>
            h('li', {class: 'row gap'},
              h('input', {class: 'input grow', value: o.name, oninput: e => (o.name = e.target.value), 'aria-label': `Option ${i + 1}`}),
              h('button', {class: 'btn icon', 'aria-label': 'Up', onclick: () => {
                move(g.options, i, -1)
                rebuild()
              }}, '↑'),
              h('button', {class: 'btn icon', 'aria-label': 'Remove', onclick: () => {
                g.options.splice(i, 1)
                rebuild()
              }}, '✕')
            )
          )),
          h('button', {class: 'btn', onclick: () => {
            g.options.push({id: id('opt'), name: ''})
            rebuild()
            setTimeout(() => [...document.querySelectorAll('.opt-list input')].pop()?.focus(), 30)
          }}, '+ Option')
        ),
        h('div', {class: 'row gap wrap'},
          h('div', {class: 'grow'}),
          !isNew && h('button', {class: 'btn danger', onclick: async () => {
            const users = d.categories.flatMap(c => c.items).filter(it => it.modifierGroups.includes(g.id))
            if (users.length && !(await confirmDialog({title: `Delete ${g.name}?`, message: `It is used by ${users.length} item(s); it will be removed from them.`, confirm: 'Delete', danger: true}))) return
            d.modifierGroups.splice(index, 1)
            for (const it of users) it.modifierGroups = it.modifierGroups.filter(x => x !== g.id)
            commit(d)
            close()
          }}, 'Delete'),
          h('button', {class: 'btn primary', onclick: () => {
            g.name = g.name.trim()
            g.options = g.options.map(o => ({...o, name: o.name.trim()})).filter(o => o.name)
            if (!g.name) return toast('Give the group a name.')
            if (!g.options.length) return toast('Add at least one option.')
            if (isNew) d.modifierGroups.push(g)
            commit(d)
            close()
          }}, 'Save')
        )
      )
    )
  }

  // ---------- actions ----------

  async function doPublish() {
    const d = draft()
    const empty = d.categories.filter(c => !c.items.length)
    if (empty.length && !(await confirmDialog({title: 'Publish anyway?', message: `${empty.map(c => c.name).join(', ')} ha${empty.length === 1 ? 's' : 've'} no items.`, confirm: 'Publish'}))) return
    await publishMenu()
    toast(`Menu v${state.menu.version} is live`)
    render()
  }

  async function loadTestMenu() {
    if (hasData()) {
      const answer = await confirmDialog({
        title: 'Replace the current menu?',
        message: 'This loads the sample menu into the designer. Orders stay as they are. A backup is taken first; you can also export one now.',
        confirm: 'Load test menu',
        extra: 'Export backup first',
        danger: true
      })
      if (answer === 'extra') {
        downloadJson(exportAll(), `yes-chef-backup-${stamp()}.json`)
        return loadTestMenu()
      }
      if (!answer) return
    }
    await importMenuToDraft(structuredClone(SAMPLE_MENU))
    await publishMenu()
    selectedCat = null
    toast('Test menu loaded and published')
    render()
  }

  async function doImport() {
    let data
    try {
      data = await pickJson()
    } catch (err) {
      return toast(err.message)
    }
    if (!data) return
    if (Array.isArray(data.events)) {
      const ok = await confirmDialog({title: 'Import full backup?', message: `This replaces the menu, settings and all ${data.events.length} history events on this device. A backup is taken first.`, confirm: 'Replace everything', danger: true})
      if (!ok) return
      await importAll(data)
      toast('Backup imported')
    } else if (Array.isArray(data.categories) && Array.isArray(data.modifierGroups)) {
      await importMenuToDraft({version: 0, categories: data.categories, modifierGroups: data.modifierGroups})
      toast('Menu loaded into the designer. Publish to make it live.')
    } else return toast('That file is not a Yes Chef menu or backup.')
    selectedCat = null
    render()
  }

  async function openBackups() {
    const list = await listBackups()
    sheet(close =>
      h('div', null,
        sheetHeader('Backups', close),
        h('p', {class: 'muted'}, 'Taken automatically before every publish, import, or history clear. The latest 30 are kept.'),
        list.length === 0 && h('p', null, 'No backups yet.'),
        h('ul', {class: 'edit-list'}, list.map(b =>
          h('li', null,
            h('div', {class: 'edit-main static'},
              h('strong', null, `${dayLabel(b.ts)} ${clock(b.ts)}`),
              h('small', {class: 'muted'}, ` · ${b.reason} · menu v${b.menu?.version ?? '–'}, ${b.menu?.categories?.length || 0} categories, ${b.events?.length || 0} events`)
            ),
            h('button', {class: 'btn small', onclick: async () => {
              await restoreBackup(b.id, false)
              toast('Menu restored into the designer. Publish to make it live.')
              close()
              render()
            }}, 'Restore menu'),
            b.events?.length > 0 && h('button', {class: 'btn small danger', onclick: async () => {
              if (!(await confirmDialog({title: 'Restore everything?', message: 'Menu, settings and history go back to this backup. Orders since then are lost (a backup of now is taken first).', confirm: 'Restore everything', danger: true}))) return
              await restoreBackup(b.id, true)
              toast('Everything restored')
              close()
              render()
            }}, 'Restore all'),
            h('button', {class: 'btn small ghost', onclick: () => downloadJson({app: 'yes-chef', kind: 'backup', menu: b.menu, settings: b.settings, events: b.events || []}, `yes-chef-backup-${new Date(b.ts).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`)}, 'Download')
          )
        ))
      ),
      {wide: true}
    )
  }

  render()
  return {el, update() {}}
}
