// End-to-end: one head and one kitchen in separate browser contexts.
// Needs internet (Trystero signals through public Nostr relays). Run: node test/e2e.mjs
import {chromium} from 'playwright'
import {spawn} from 'node:child_process'
import {mkdirSync} from 'node:fs'

const OUT = process.env.SHOTS || 'test/shots'
mkdirSync(OUT, {recursive: true})
const server = spawn('node', ['tools/serve.mjs'], {env: {...process.env, PORT: '8091'}, stdio: 'ignore'})
await new Promise(r => setTimeout(r, 500))
const URL = 'http://localhost:8091/yes-chef/'

// CHROMIUM_PATH lets systems without Playwright's bundled browser (e.g. NixOS) use their own.
// Headless Chromium can't resolve the mDNS names WebRTC uses for local IPs, so expose them.
const browser = await chromium.launch({
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})
})
const viewport = {width: 1180, height: 820}
const headCtx = await browser.newContext({viewport})
const kitCtx = await browser.newContext({viewport})
const head = await headCtx.newPage()
const kit = await kitCtx.newPage()
for (const [name, p] of [['head', head], ['kitchen', kit]]) {
  p.on('pageerror', e => console.log(`[${name} error]`, e.message))
  p.on('console', m => m.type() === 'error' && console.log(`[${name} console]`, m.text()))
}
const step = async (msg, fn) => {
  process.stdout.write(`• ${msg} … `)
  await fn()
  console.log('ok')
}
const shot = (p, n) => p.screenshot({path: `${OUT}/${n}.png`})

try {
  await step('head picks role and loads test menu', async () => {
    await head.goto(URL)
    await shot(head, '01-role')
    await head.getByRole('button', {name: /Head/}).click()
    await head.locator('.tabs button', {hasText: 'Menu'}).click()
    await head.getByRole('button', {name: 'Load test menu'}).click()
    await head.getByText('Live: v1').waitFor()
    await shot(head, '02-menu')
  })

  let code
  await step('head shows pairing code', async () => {
    await head.locator('.tabs button', {hasText: 'Settings'}).click()
    code = (await head.locator('.code').textContent()).trim()
    await shot(head, '03-settings')
  })

  await step('kitchen pairs with typed code', async () => {
    await kit.goto(URL)
    await kit.getByRole('button', {name: /Kitchen/}).click()
    await kit.getByLabel('Pairing code').fill(code)
    await shot(kit, '04-pair')
    await kit.getByRole('button', {name: 'Pair', exact: true}).click()
    await kit.locator('.badge.ok').waitFor({timeout: 60000})
    await head.locator('.badge.ok').waitFor({timeout: 30000})
  })

  await step('head takes an order and sends it', async () => {
    await head.locator('.tabs button', {hasText: 'Order'}).click()
    await head.locator('.cat-btn', {hasText: 'Burgers'}).click()
    await head.locator('.item-btn', {hasText: 'Classic Burger'}).click()
    await head.getByRole('button', {name: 'Choose Temperature'}).waitFor()
    await head.locator('.chip', {hasText: 'Medium rare'}).click()
    await head.locator('.chip', {hasText: 'Add bacon'}).click()
    await head.locator('.qty.big button[aria-label=More]').click()
    await shot(head, '05-item')
    await head.getByRole('button', {name: 'Add 2 to ticket'}).click()
    await head.locator('.cat-btn', {hasText: 'Drinks'}).click()
    await head.locator('.item-btn', {hasText: 'Water'}).click()
    await head.getByRole('button', {name: 'Add 1 to ticket'}).click()
    await head.getByLabel('Order name').fill('Sam')
    await shot(head, '06-ticket')
    await head.locator('.send').click()
    await head.getByText('Order #1 sent').waitFor()
  })

  await step('kitchen receives the ticket', async () => {
    await kit.locator('.card', {hasText: 'Sam'}).waitFor({timeout: 15000})
    await kit.locator('.card', {hasText: 'Medium rare · Add bacon'}).waitFor()
    await shot(kit, '07-kitchen')
  })

  await step('head undo toast pulls order back; kitchen card disappears', async () => {
    await head.locator('.cat-btn', {hasText: 'Sides'}).click()
    await head.locator('.item-btn', {hasText: 'Side Salad'}).click()
    await head.locator('.chip', {hasText: 'Ranch'}).click()
    await head.getByRole('button', {name: 'Add 1 to ticket'}).click()
    await head.getByLabel('Order name').fill('Oops')
    await head.locator('.send').click()
    await kit.locator('.card', {hasText: 'Oops'}).waitFor({timeout: 15000})
    await head.locator('.toast', {hasText: 'Order #2 sent'}).getByRole('button', {name: 'Undo'}).click()
    await kit.locator('.card', {hasText: 'Oops'}).waitFor({state: 'detached', timeout: 15000})
  })

  await step('head modifies order #1; kitchen sees the change', async () => {
    await head.locator('.tabs button', {hasText: 'History'}).click()
    await head.locator('.hist-row', {hasText: 'Sam'}).click()
    await head.getByRole('button', {name: 'Modify'}).click()
    await head.locator('.cat-btn', {hasText: 'Sides'}).click()
    await head.locator('.item-btn', {hasText: 'Fries'}).click()
    await head.locator('.chip', {hasText: 'Large'}).click()
    await head.getByRole('button', {name: 'Add 1 to ticket'}).click()
    await head.getByRole('button', {name: 'Save changes'}).click()
    await kit.locator('.card.modified', {hasText: '+ 1× Fries (Large)'}).waitFor({timeout: 15000})
    await shot(kit, '08-modified')
  })

  await step('kitchen marks Done; head history shows Done', async () => {
    await kit.locator('.card', {hasText: 'Sam'}).getByRole('button', {name: 'Done'}).click()
    await kit.locator('.card', {hasText: 'Sam'}).waitFor({state: 'detached', timeout: 15000})
    await head.locator('.tabs button', {hasText: 'History'}).click()
    await head.locator('.hist-row', {hasText: 'Sam'}).locator('.pill', {hasText: 'Done'}).waitFor({timeout: 15000})
    await shot(head, '09-history')
  })

  await step('kitchen Recall brings the ticket back', async () => {
    await kit.getByRole('button', {name: '↶ Recall'}).click()
    await kit.locator('.card', {hasText: 'Sam'}).waitFor({timeout: 15000})
  })

  await step('head enables Started; kitchen shows Started button', async () => {
    await head.locator('.tabs button', {hasText: 'Settings'}).click()
    await head.locator('.toggle', {hasText: 'Started'}).click()
    await kit.locator('.card', {hasText: 'Sam'}).getByRole('button', {name: 'Started'}).waitFor({timeout: 15000})
    await shot(kit, '10-started')
  })

  await step('kitchen reload keeps tickets and reconnects', async () => {
    await kit.reload()
    await kit.locator('.card', {hasText: 'Sam'}).waitFor({timeout: 15000})
    await kit.locator('.badge.ok').waitFor({timeout: 60000})
  })

  await step('order timeline shows undone events greyed', async () => {
    await head.locator('.tabs button', {hasText: 'History'}).click()
    await head.locator('.hist-row', {hasText: 'Sam'}).click()
    await head.locator('.timeline li.undone').first().waitFor()
    await shot(head, '11-timeline')
  })
  console.log('\nAll steps passed.')
} catch (err) {
  console.log('FAILED\n', err.message)
  await shot(head, 'fail-head')
  await shot(kit, 'fail-kitchen')
  process.exitCode = 1
} finally {
  await browser.close()
  server.kill()
}
