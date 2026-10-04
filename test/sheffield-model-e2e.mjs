// Manual test with the real model in the browser (not run in CI: ~0.8 GB download).
// Hires the compact tier, sends the fixture photo, answers questions, checks the menu.
//   CHROMIUM_PATH=... node test/sheffield-model-e2e.mjs [--webgpu]
import {chromium} from 'playwright'
import {spawn} from 'node:child_process'
import {mkdirSync} from 'node:fs'

const OUT = 'test/shots'
const PROFILE = process.env.PROFILE || 'node_modules/.cache/sheffield-browser-profile'
mkdirSync(OUT, {recursive: true})
const server = spawn('node', ['tools/serve.mjs'], {env: {...process.env, PORT: '8094'}, stdio: 'ignore'})
await new Promise(r => setTimeout(r, 500))

const webgpu = process.argv.includes('--webgpu')
const ctx = await chromium.launchPersistentContext(PROFILE, {
  viewport: {width: 1180, height: 820},
  ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
  // SwiftShader gives headless Chromium a (slow, software) WebGPU adapter without shader-f16.
  args: webgpu ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'] : []
})
const page = ctx.pages()[0] || (await ctx.newPage())
page.on('pageerror', e => console.log('[pageerror]', e.message))
page.on('console', m => /error|warn/i.test(m.type()) && console.log(`[${m.type()}]`, m.text().slice(0, 300)))
page.on('worker', w => w.on('console', m => console.log('[worker]', m.text().slice(0, 300))))
ctx.on('requestfailed', r => console.log('[failed]', r.url().slice(0, 120), r.failure()?.errorText))
const t0 = Date.now()
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`

try {
  await page.goto('http://localhost:8094/yes-chef/')
  // The persistent profile keeps an old app shell; drop it (not the model cache) and reload.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
    for (const k of await caches.keys()) if (k.startsWith('yes-chef-')) await caches.delete(k)
  })
  await page.reload()
  await page.locator('.role-screen, .tabs').first().waitFor()
  if (await page.locator('.role-screen').isVisible()) await page.getByRole('button', {name: /Head/}).click()
  await page.locator('.tabs button', {hasText: 'Menu'}).click()
  await page.getByRole('button', {name: 'Ask Sheffield'}).click()
  await page.getByRole('button', {name: 'Start over'}).click()
  await page.getByRole('button', {name: 'Start over', exact: true}).last().click()

  if (await page.getByText('Hire Sheffield to read menu photos').isVisible().catch(() => false)) {
    console.log('hiring compact tier…')
    await page.locator('.sf-tier', {hasText: 'compact'}).click()
    let lastLog = 0
    let resumes = 0
    while (!(await page.getByText('Sheffield is at your service').isVisible().catch(() => false))) {
      if (Date.now() - lastLog > 30000) {
        lastLog = Date.now()
        const txt = (await page.locator('.sf-hire, .sf-head .muted').first().innerText().catch(() => '')) || ''
        console.log(`  ${elapsed()} ${txt.replace(/\s+/g, ' ').slice(0, 120)}`)
      }
      if (await page.getByText(/Sheffield couldn’t start/).isVisible().catch(() => false)) throw new Error('hire failed: ' + (await page.locator('.sf-messages').textContent()))
      if (await page.locator('.sf-messages').getByText(/download was interrupted/).last().isVisible().catch(() => false)) {
        resumes++
        if (resumes > 3) throw new Error('download kept stalling')
        console.log(`  ${elapsed()} interrupted, hiring again (resume ${resumes})`)
        await page.getByRole('button', {name: 'Start over'}).click()
        await page.getByRole('button', {name: 'Start over', exact: true}).last().click()
        await page.locator('.sf-tier', {hasText: 'compact'}).click()
      }
      await page.waitForTimeout(2000)
    }
    console.log(`\nhired after ${elapsed()}`)
  }
  console.log('status:', await page.locator('.sf-head .muted').textContent())

  await page.locator('input[type=file]').setInputFiles('test/fixtures/chalkboard-menu.jpg')
  await page.getByRole('button', {name: 'Send'}).click()
  await page.getByText('Here is what I read').waitFor({timeout: 15 * 60e3})
  console.log(`transcribed after ${elapsed()}`)
  for (let i = 0; i < 6; i++) {
    const chip = page.locator('.sf-choices .chip').first()
    if (!(await chip.isVisible().catch(() => false))) break
    const label = await chip.textContent()
    console.log('  answering:', (await page.locator('.sf-msg.sheffield .sf-bubble').last().textContent()).slice(0, 90), '→', label)
    await chip.click()
    await page.waitForTimeout(300)
  }
  for (const cat of ['Burgers', 'Sides', 'Drinks']) await page.locator('.sf-preview .sf-cat', {hasText: cat}).waitFor({timeout: 10000})
  console.log('preview:', (await page.locator('.sf-preview').innerText()).replace(/\n+/g, ' | ').slice(0, 500))
  await page.screenshot({path: `${OUT}/13-sheffield-photo.png`})
  console.log('\nModel test passed.')
} catch (err) {
  console.log('\nFAILED', err.message)
  await page.screenshot({path: `${OUT}/fail-sheffield-model.png`})
  process.exitCode = 1
} finally {
  await ctx.close()
  server.kill()
}
