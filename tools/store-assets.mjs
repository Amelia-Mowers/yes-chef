// Google Play store assets from the real app, into docs/store/:
// phone screenshots (1080×1920, 9:16), 7" tablet (1920×1080) and 10" tablet
// (2560×1440) screenshots (16:9, as Play requires), and the 1024×500 feature
// graphic.   CHROMIUM_PATH=... node tools/store-assets.mjs
import {chromium} from 'playwright'
import {spawn} from 'node:child_process'
import {copyFileSync, readFileSync} from 'node:fs'

const OUT = 'docs/store'
const server = spawn('node', ['tools/serve.mjs'], {env: {...process.env, PORT: '8098'}, stdio: 'ignore'})
await new Promise(r => setTimeout(r, 500))
const URL = 'http://localhost:8098/yes-chef/'
const browser = await chromium.launch({args: ['--disable-features=WebRtcHideLocalIpsWithMdns'], ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})})
const tablet = {viewport: {width: 1280, height: 720}, deviceScaleFactor: 2}
// Each tablet shot in both Play sizes: 7" = 960×540 CSS px, 10" = 1280×720, both at 2×.
const SIZES = {tablet7: {width: 960, height: 540}, tablet10: {width: 1280, height: 720}}
async function tabletShot(p, name) {
  for (const [prefix, size] of Object.entries(SIZES)) {
    await p.setViewportSize(size)
    await p.waitForTimeout(250)
    await p.screenshot({path: `${OUT}/${prefix}-${name}.png`})
  }
}
const phone = {viewport: {width: 360, height: 640}, deviceScaleFactor: 3, isMobile: true, hasTouch: true}
const quiet = p => p.addStyleTag({content: '#toasts, .update-banner { display: none !important } input:focus { outline: none !important }'})
const shot = (p, name) => p.screenshot({path: `${OUT}/${name}.png`})

async function addItem(p, cat, item, {chips = [], plate} = {}) {
  await p.locator('.cat-btn', {hasText: cat}).click()
  await p.locator('.item-btn', {hasText: item}).click()
  for (const c of chips) await p.locator('.sheet .chip', {hasText: c}).first().click()
  if (plate) await p.locator('.sheet .chip', {hasText: plate}).click()
  await p.getByRole('button', {name: /^Add \d+ to ticket$/}).click()
}

async function role(ctxOpts, name, code, pairName) {
  const p = await (await browser.newContext(ctxOpts)).newPage()
  await p.goto(URL)
  await p.getByRole('button', {name: new RegExp(`^${name}`)}).click()
  if (code) {
    if (pairName) await p.getByLabel(/name/i).fill(pairName)
    await p.getByLabel('Pairing code').fill(code)
    await p.getByRole('button', {name: 'Pair', exact: true}).click()
    await p.locator('.badge.ok').waitFor({timeout: 60000})
  }
  return p
}

try {
  const head = await role(tablet, 'Head')
  await head.locator('.tabs button', {hasText: 'Menu'}).click()
  await head.getByRole('button', {name: 'Load test menu'}).click()
  await head.locator('.tabs button', {hasText: 'Settings'}).click()
  const code = (await head.locator('.code').textContent()).trim()
  const kit = await role(tablet, 'Kitchen', code, 'Grill')
  const kitPhone = await role(phone, 'Kitchen', code, 'Pass')
  const dark = await role({...tablet, colorScheme: 'dark'}, 'Kitchen', code, 'Fryer')

  await head.locator('.tabs button', {hasText: 'Order'}).click()
  const orders = [
    {name: 'Table 4', items: [['Burgers', 'Classic Burger', {chips: ['Medium rare', 'Add bacon'], plate: '+ New plate'}], ['Sides', 'Fries', {chips: ['Large'], plate: 'Plate 1'}], ['Burgers', 'Veggie Burger', {chips: ['No onion'], plate: '+ New plate'}], ['Drinks', 'Lemonade', {chips: ['Regular'], plate: 'No plate'}]]},
    {name: 'Sam', items: [['Burgers', 'Cheeseburger', {chips: ['Well done', 'Cheddar']}], ['Drinks', 'Milkshake', {chips: ['Chocolate']}]]},
    {name: 'Jo', items: [['Sides', 'Side Salad', {chips: ['Vinaigrette']}], ['Desserts', 'Brownie', {chips: ['Add a scoop']}]]}
  ]
  for (const o of orders) {
    for (const [cat, item, opts] of o.items) await addItem(head, cat, item, opts)
    await head.getByLabel('Order name').fill(o.name)
    await head.locator('.send').click()
    await kit.locator('.card', {hasText: o.name}).waitFor({timeout: 15000})
  }
  for (const [cat, item, opts] of [['Burgers', 'Chicken Sandwich', {chips: ['Hot'], plate: '+ New plate'}], ['Sides', 'Onion Rings', {chips: ['Regular'], plate: 'Plate 1'}], ['Drinks', 'Cola', {chips: ['Large', 'No ice'], plate: 'No plate'}]]) await addItem(head, cat, item, opts)
  await head.getByLabel('Order name').fill('Table 7')
  await head.getByLabel('Order name').blur()
  for (const p of [head, kit, kitPhone, dark]) await quiet(p)
  await kit.waitForTimeout(3500) // let new-ticket highlights settle
  await tabletShot(head, '1-order')
  await tabletShot(kit, '2-kitchen')
  await tabletShot(dark, '3-kitchen-dark')
  await head.locator('.tabs button', {hasText: 'History'}).click()
  await head.locator('.hist-row', {hasText: 'Table 4'}).click()
  await head.waitForTimeout(400)
  await tabletShot(head, '4-order-timeline')
  await shot(kitPhone, 'phone-3-kitchen')

  const ph = await role(phone, 'Head')
  await ph.locator('.tabs button', {hasText: 'Menu'}).click()
  await ph.getByRole('button', {name: 'Load test menu'}).click()
  await ph.locator('.tabs button', {hasText: 'Order'}).click()
  await quiet(ph)
  await shot(ph, 'phone-1-order')
  await ph.locator('.cat-btn', {hasText: 'Burgers'}).click()
  await ph.locator('.item-btn', {hasText: 'Classic Burger'}).click()
  await ph.locator('.sheet .chip', {hasText: 'Medium rare'}).click()
  await ph.locator('.sheet .chip', {hasText: 'Add bacon'}).click()
  await ph.waitForTimeout(400)
  await shot(ph, 'phone-2-choices')

  // Feature graphic: 1024×500.
  const fg = await (await browser.newContext({viewport: {width: 1024, height: 500}})).newPage()
  const img = f => `data:image/png;base64,${readFileSync(`${OUT}/${f}`).toString('base64')}`
  const icon = `data:image/svg+xml;base64,${readFileSync('icons/icon.svg').toString('base64')}`
  await fg.setContent(`<!doctype html><html><body style="margin:0;width:1024px;height:500px;overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#1f1b16 0%,#2d2820 100%);color:#f3ede4;position:relative">
    <div style="position:absolute;left:64px;top:0;bottom:0;width:430px;display:flex;flex-direction:column;justify-content:center;gap:18px">
      <div style="display:flex;align-items:center;gap:16px"><img src="${icon}" style="width:76px;height:76px"><span style="font-size:52px;font-weight:800;letter-spacing:-1px">Yes Chef</span></div>
      <div style="font-size:30px;line-height:1.2;font-weight:700">Orders from the front to the kitchen, in a tap.</div>
      <div style="font-size:19px;color:#c9bdae">Tablet tickets over your own Wi-Fi</div>
    </div>
    <img src="${img('tablet10-3-kitchen-dark.png')}" style="position:absolute;left:520px;top:58px;width:600px;border-radius:18px;border:2px solid #3d362c;box-shadow:0 20px 60px rgba(0,0,0,.5)">
  </body></html>`)
  await fg.waitForTimeout(300)
  await fg.screenshot({path: `${OUT}/feature-graphic.png`})
  copyFileSync('icons/icon-512.png', `${OUT}/icon-512.png`)
  console.log('store assets written to docs/store/')
} finally {
  await browser.close()
  server.kill()
}
