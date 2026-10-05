// End-to-end: one head and one kitchen in separate browser contexts.
// Needs internet (Trystero signals through public Nostr relays). Run: node test/e2e.mjs
import {chromium} from 'playwright'
import {spawn, execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'

const OUT = process.env.SHOTS || 'test/shots'
mkdirSync(OUT, {recursive: true})
const server = spawn('node', ['tools/serve.mjs'], {env: {...process.env, PORT: '8091'}, stdio: 'ignore'})
// Our signaling relay, run locally (the app on localhost looks for it on :8788).
const relay = spawn('npx', ['wrangler', 'dev', '--config', 'relay/wrangler.jsonc', '--env', 'dev', '--port', '8788'], {stdio: 'ignore', detached: true})
// The licensing/backup API, local with fake Play purchases and the dev signing key.
const apiState = mkdtempSync(join(tmpdir(), 'yes-chef-api-'))
writeFileSync('api/.dev.vars', `LICENSE_PRIVATE_KEY='${JSON.stringify(JSON.parse(readFileSync('api/dev-license-key.json', 'utf8')))}'\nBACKUP_MASTER_KEY=${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')}\nRTDN_SECRET=dev\n`)
const apiArgs = ['--config', 'api/wrangler.jsonc', '--env', 'dev', '--persist-to', apiState]
execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', ...apiArgs], {stdio: 'ignore'})
const api = spawn('npx', ['wrangler', 'dev', ...apiArgs, '--port', '8799'], {stdio: 'ignore', detached: true})
for (const [name, url] of [['relay', 'http://localhost:8788/health'], ['api', 'http://localhost:8799/health']]) {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break
    } catch {}
    if (i > 120) throw new Error(`${name} did not start`)
    await new Promise(r => setTimeout(r, 500))
  }
}
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
    await kit.locator('.tabs button', {hasText: 'Settings'}).click()
    await kit.getByText('Connecting through the Yes Chef relay.').waitFor()
    await kit.locator('.tabs button', {hasText: 'Tickets'}).click()
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
  await step('Sheffield page: download instructions and import an assistant menu.json', async () => {
    await head.keyboard.press('Escape')
    await head.locator('.tabs button', {hasText: 'Menu'}).click()
    await head.getByRole('button', {name: 'Sheffield'}).click()
    await head.getByText('Good day. I work through whichever chat assistant').waitFor()
    const [download] = await Promise.all([head.waitForEvent('download'), head.getByRole('button', {name: 'Download instructions'}).click()])
    assert(download.suggestedFilename() === 'sheffield-instructions.txt', 'instructions file name')
    await shot(head, '12-sheffield')
    const [chooser] = await Promise.all([head.waitForEvent('filechooser'), head.getByRole('button', {name: 'Import menu.json'}).click()])
    await chooser.setFiles('test/fixtures/assistant-menu.json')
    await head.getByText(/2 categories, 4 items, 2 choice groups/).waitFor()
    await head.getByRole('button', {name: 'Load menu'}).click()
    await head.locator('.edit-list li', {hasText: 'Onion Rings'}).waitFor({state: 'attached'}).catch(() => {})
    await head.locator('.edit-list li', {hasText: 'Burgers'}).waitFor()
    await head.getByText('Unpublished changes').waitFor()
  })

  await step('plates group items on the head ticket and the kitchen card', async () => {
    await head.keyboard.press('Escape')
    await head.locator('.tabs button', {hasText: 'Order'}).click()
    await head.locator('.cat-btn', {hasText: 'Burgers'}).click()
    await head.locator('.item-btn', {hasText: 'Veggie Burger'}).click()
    await head.locator('.chip', {hasText: '+ New plate'}).click()
    await head.getByRole('button', {name: 'Add 1 to ticket'}).click()
    await head.locator('.cat-btn', {hasText: 'Sides'}).click()
    await head.locator('.item-btn', {hasText: 'Onion Rings'}).click()
    await head.locator('.chip', {hasText: 'Regular'}).click()
    await head.locator('.chip.on', {hasText: 'Plate 1'}).waitFor() // remembers the last plate
    await head.getByRole('button', {name: 'Add 1 to ticket'}).click()
    await head.locator('.cat-btn', {hasText: 'Drinks'}).click()
    await head.locator('.item-btn', {hasText: 'Water'}).click()
    await head.locator('.chip', {hasText: 'No plate'}).click()
    await head.getByRole('button', {name: 'Add 1 to ticket'}).click()
    await head.getByLabel('Order name').fill('Plates')
    await head.locator('.ticket .plate-head', {hasText: 'Plate 1'}).waitFor()
    await shot(head, '13-plates-ticket')
    await head.locator('.send').click()
    const card = kit.locator('.card', {hasText: 'Plates'})
    await card.waitFor({timeout: 15000})
    const rows = await card.locator('.card-lines > li').allInnerTexts()
    assert.deepEqual(rows.map(r => r.replace(/\s+/g, ' ').trim()), ['1 Water', 'PLATE 1', '1 Veggie Burger', '1 Onion Rings Regular'])
    await shot(kit, '14-plates-kitchen')
  })

  await step('an order taker pairs, sends through the head, and can undo', async () => {
    const takerCtx = await browser.newContext({viewport})
    const taker = await takerCtx.newPage()
    taker.on('pageerror', e => console.log('[taker error]', e.message))
    try {
      await head.locator('.tabs button', {hasText: 'Settings'}).click()
      const code = (await head.locator('.code').textContent()).trim()
      await taker.goto(URL)
      await taker.getByRole('button', {name: /Order taker/}).click()
      await taker.getByText('Pair this order taker').waitFor()
      await taker.getByLabel('Device name').fill('Front 2')
      await taker.getByLabel('Pairing code').fill(code)
      await taker.getByRole('button', {name: 'Pair', exact: true}).click()
      await taker.locator('.badge.ok').waitFor({timeout: 60000})
      await head.locator('li', {hasText: 'Front 2 · order taker'}).waitFor({timeout: 30000})
      await taker.locator('.cat-btn', {hasText: 'Desserts'}).waitFor({timeout: 15000}) // menu arrived from the head
      await taker.locator('.cat-btn', {hasText: 'Desserts'}).click()
      await taker.locator('.item-btn', {hasText: 'Apple Pie'}).click()
      await taker.getByRole('button', {name: 'Add 1 to ticket'}).click()
      await taker.getByLabel('Order name').fill('From taker')
      await taker.locator('.send').click()
      const sent = taker.locator('.toast', {hasText: /Order #\d+ sent/})
      await sent.waitFor({timeout: 15000})
      const number = (await sent.textContent()).match(/#(\d+)/)[1]
      const card = kit.locator('.card', {hasText: 'From taker'})
      await card.waitFor({timeout: 15000})
      assert((await card.locator('.card-num').textContent()) === `#${number}`, 'kitchen shows the number the head assigned')
      await shot(taker, '16-taker')
      await sent.getByRole('button', {name: 'Undo'}).click()
      await card.waitFor({state: 'detached', timeout: 15000})
      await head.locator('.tabs button', {hasText: 'History'}).click()
      await head.locator('.hist-row.undone', {hasText: 'From taker'}).waitFor({timeout: 15000})
    } finally {
      await takerCtx.close()
    }
  })

  await step('a licensed head backs up to the cloud and restores', async () => {
    await head.locator('.tabs button', {hasText: 'Settings'}).click()
    await head.getByText('free in the browser during early access').waitFor()
    const result = await head.evaluate(() => window.__yesChef.activateLicense('test-active-77', {deviceName: 'Front tablet'}))
    assert(result.ok, 'activation succeeded: ' + JSON.stringify(result))
    await head.getByText('Subscription active. This tablet is the head.').waitFor()
    await head.getByRole('button', {name: 'Back up now'}).click()
    await head.getByText('Backed up to the cloud').waitFor()
    await head.getByRole('button', {name: 'Restore from cloud'}).click()
    await head.locator('.sheet li', {hasText: 'manual · from Front tablet'}).waitFor()
    await shot(head, '17-cloud-restore')
    await head.locator('.sheet li').first().getByRole('button', {name: 'Restore'}).click()
    await head.getByRole('button', {name: 'Restore', exact: true}).last().click()
    await head.getByText('Restored from the cloud').waitFor()
  })

  await step('Android app: head needs a subscription, trial unlocks it, a second tablet is offered the move', async () => {
    // Pretend to be the Trusted Web Activity with Play Billing (fake purchase tokens).
    const fakePlay = token => {
      localStorage.setItem('yes-chef-android-app', '1')
      window.getDigitalGoodsService = async () => ({
        getDetails: async ids => ids.map(itemId => ({itemId, price: {currency: 'USD', value: itemId.includes('yearly') ? '190' : '19'}, freeTrialPeriod: 'P30D'})),
        listPurchases: async () => [{itemId: 'yes_chef_monthly', purchaseToken: token}]
      })
      window.PaymentRequest = class {
        async show() {
          return {details: {purchaseToken: token}, complete: async () => {}}
        }
      }
    }
    const tablets = []
    try {
      for (let i = 0; i < 2; i++) {
        const ctx = await browser.newContext({viewport})
        await ctx.addInitScript(fakePlay, 'test-active-501')
        const p = await ctx.newPage()
        tablets.push(ctx)
        await p.goto(URL)
        await p.getByRole('button', {name: /Head/}).click()
        await p.getByRole('heading', {name: 'Start your 30-day free trial'}).waitFor()
        if (i === 0) {
          await p.locator('.plan', {hasText: '$190.00 / year'}).waitFor()
          await shot(p, '18-paywall')
          await p.locator('.plan', {hasText: 'Monthly'}).click()
          await p.getByText('Subscription active').first().waitFor()
          await p.locator('.order-screen').waitFor() // order screen unlocked
        } else {
          await p.getByRole('button', {name: 'Restore purchase'}).click()
          await p.getByText('Move the subscription to this tablet?').waitFor()
          await p.getByRole('button', {name: 'Move it here'}).click()
          await p.locator('.order-screen').waitFor()
        }
      }
    } finally {
      for (const ctx of tablets) await ctx.close()
    }
  })

  await step('a new deploy shows the reload banner, and reload picks it up', async () => {
    // Serve an assembled copy, then change its version like a deploy would.
    const root = mkdtempSync(join(tmpdir(), 'yes-chef-site-'))
    for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'vendor', 'icons']) cpSync(f, join(root, f), {recursive: true})
    const stamp = build => {
      writeFileSync(join(root, 'sw.js'), readFileSync('sw.js', 'utf8').replace(/^const VERSION = .*/m, `const VERSION = 'yes-chef-${build}'`))
      writeFileSync(join(root, 'js/version.js'), `export const BUILD = '${build}'\n`)
    }
    stamp('aaaaaaa')
    const site = spawn('node', ['tools/serve.mjs'], {env: {...process.env, PORT: '8092', ROOT: root + '/'}, stdio: 'ignore'})
    await new Promise(r => setTimeout(r, 500))
    const ctx = await browser.newContext({viewport})
    const p = await ctx.newPage()
    try {
      await p.goto('http://localhost:8092/yes-chef/')
      await p.getByRole('button', {name: /Head/}).click()
      await p.evaluate(() => navigator.serviceWorker.ready)
      await p.locator('.tabs button', {hasText: 'Settings'}).click()
      await p.getByText('Yes Chef aaaaaaa').waitFor()
      stamp('bbbbbbb')
      await p.getByRole('button', {name: 'Check for updates'}).click()
      await p.locator('.update-banner').waitFor({timeout: 15000})
      await shot(p, '15-update-banner')
      await p.locator('.update-banner').getByRole('button', {name: 'Reload'}).click()
      await p.locator('.tabs button', {hasText: 'Settings'}).click()
      await p.getByText('Yes Chef bbbbbbb').waitFor()
    } finally {
      await ctx.close()
      site.kill()
    }
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
  for (const p of [relay, api]) {
    try {
      process.kill(-p.pid)
    } catch {}
  }
  rmSync('api/.dev.vars', {force: true})
  rmSync(apiState, {recursive: true, force: true})
}
