// Captures marketing screenshots of the real app into site/img/.
//   CHROMIUM_PATH=... node tools/screenshots.mjs
// Pairs a head and a kitchen over the public relays, like test/e2e.mjs.
import {chromium} from 'playwright'
import {spawn} from 'node:child_process'

const server = spawn('node', ['tools/serve.mjs'], {env: {...process.env, PORT: '8096'}, stdio: 'ignore'})
await new Promise(r => setTimeout(r, 500))
const URL = 'http://localhost:8096/yes-chef/'
const browser = await chromium.launch({
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})
})
const tablet = {viewport: {width: 1180, height: 820}, deviceScaleFactor: 2}
const quiet = p => p.addStyleTag({content: '#toasts, .update-banner { display: none !important }'})
const shot = (p, name) => p.screenshot({path: `site/img/${name}.png`})

async function addItem(p, cat, item, {chips = [], plate} = {}) {
  await p.locator('.cat-btn', {hasText: cat}).click()
  await p.locator('.item-btn', {hasText: item}).click()
  for (const c of chips) await p.locator('.sheet .chip', {hasText: c}).first().click()
  if (plate) await p.locator('.sheet .chip', {hasText: plate}).click()
  await p.getByRole('button', {name: /^Add \d+ to ticket$/}).click()
}

try {
  const head = await (await browser.newContext(tablet)).newPage()
  await head.goto(URL)
  await head.getByRole('button', {name: /Head/}).click()
  await head.locator('.tabs button', {hasText: 'Menu'}).click()
  await head.getByRole('button', {name: 'Load test menu'}).click()
  await head.locator('.tabs button', {hasText: 'Settings'}).click()
  const code = (await head.locator('.code').textContent()).trim()

  const kit = await (await browser.newContext(tablet)).newPage()
  await kit.goto(URL)
  await kit.getByRole('button', {name: /Kitchen/}).click()
  await kit.getByLabel('Kitchen name').fill('Grill')
  await kit.getByLabel('Pairing code').fill(code)
  await kit.getByRole('button', {name: 'Pair', exact: true}).click()
  await kit.locator('.badge.ok').waitFor({timeout: 60000})

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
  // A ticket in progress for the order-screen shot.
  for (const [cat, item, opts] of [['Burgers', 'Chicken Sandwich', {chips: ['Hot'], plate: '+ New plate'}], ['Sides', 'Onion Rings', {chips: ['Regular'], plate: 'Plate 1'}], ['Drinks', 'Cola', {chips: ['Large', 'No ice'], plate: 'No plate'}]]) await addItem(head, cat, item, opts)
  await head.getByLabel('Order name').fill('Table 7')
  await quiet(head)
  await quiet(kit)
  await kit.locator('.card', {hasText: 'Sam'}).getByRole('button', {name: 'Done'}).click()
  await kit.locator('.card', {hasText: 'Sam'}).waitFor({state: 'detached'})
  await head.waitForTimeout(500)
  await shot(head, 'order')
  await shot(kit, 'kitchen')

  const dark = await (await browser.newContext({...tablet, colorScheme: 'dark'})).newPage()
  await dark.goto(URL)
  await dark.getByRole('button', {name: /Kitchen/}).click()
  await dark.getByLabel('Pairing code').fill(code)
  await dark.getByRole('button', {name: 'Pair', exact: true}).click()
  await dark.locator('.card', {hasText: 'Table 4'}).waitFor({timeout: 60000})
  await quiet(dark)
  await dark.waitForTimeout(2500) // let the new-ticket flash finish
  await shot(dark, 'kitchen-dark')

  await head.locator('.tabs button', {hasText: 'History'}).click()
  await shot(head, 'history')

  const phone = await (await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true})).newPage()
  await phone.goto(URL)
  await phone.getByRole('button', {name: /Head/}).click()
  await phone.locator('.tabs button', {hasText: 'Menu'}).click()
  await phone.getByRole('button', {name: 'Load test menu'}).click()
  await phone.locator('.tabs button', {hasText: 'Order'}).click()
  await quiet(phone)
  await phone.locator('.cat-btn', {hasText: 'Burgers'}).click()
  await phone.locator('.item-btn', {hasText: 'Classic Burger'}).click()
  await phone.locator('.sheet .chip', {hasText: 'Medium rare'}).click()
  await phone.locator('.sheet .chip', {hasText: 'Add bacon'}).click()
  await phone.waitForTimeout(400)
  await shot(phone, 'phone-item')
  console.log('screenshots written to site/img/')
} finally {
  await browser.close()
  server.kill()
}
