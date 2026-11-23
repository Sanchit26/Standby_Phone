import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const modulePath = process.env.STANDBY_PLAYWRIGHT_MODULE
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright-core')
const browser = await chromium.launch({ executablePath: process.env.STANDBY_BROWSER })
const url = process.env.STANDBY_TEST_URL ?? 'http://127.0.0.1:4173'
const screenshots = process.env.STANDBY_SCREENSHOTS
if (screenshots) await mkdir(screenshots, { recursive: true })

try {
  const page = await browser.newPage({ viewport: { width: 915, height: 412 }, hasTouch: true })
  const input = await page.context().newCDPSession(page)
  const button = name => page.getByRole('button', { name, exact: true })
  const sanctuary = page.locator('.sanctuary')
  const video = page.locator('.ambient-stage video')
  const audio = page.locator('.sanctuary-audio')
  const dialog = page.getByRole('dialog', { name: 'Sanctuary library' })
  const openLibrary = () => button('Library').click()
  const fit = () => video.evaluate(el => getComputedStyle(el).objectFit)
  const muted = () => video.evaluate(el => el.muted)
  const pauseState = paused => page.waitForFunction(expected =>
    document.querySelector('.ambient-stage video')?.paused === expected, paused)
  const select = name => dialog.locator('.library-row').filter({ hasText: name })
    .getByRole('button', { name: 'View', exact: true }).click()

  async function touch(x, y, dx = 0, dy = 0, hold = 0) {
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    if (hold) await new Promise(resolve => setTimeout(resolve, hold))
    if (dx || dy) {
      for (let step = 1; step <= 5; step++) {
        await input.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: x + dx * step / 5, y: y + dy * step / 5 }],
        })
      }
    }
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  async function importPhoto() {
    await page.evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 160, height: 120 })
      const context = canvas.getContext('2d')
      const paint = color => {
        context.fillStyle = color
        context.fillRect(0, 0, 160, 120)
        context.fillStyle = '#ebd6a6'
        context.fillRect(36, 25, 88, 70)
      }
      paint('#374d66')
      const png = await new Promise(resolve => canvas.toBlob(resolve))
      const file = new File([png], 'Sample photo.png', { type: 'image/png' })
      const input = document.querySelector('.sanctuary input[type=file]')
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await button('Add to library').click()
  }

  await page.goto(url + '/#/sanctuary')
  await sanctuary.waitFor()
  await importPhoto()
  const photo = page.locator('.ambient-stage').getByRole('img', { name: 'Sample photo.png' })
  await photo.waitFor()
  assert.equal(await photo.evaluate(el => getComputedStyle(el).objectFit), 'contain')
  await page.locator('.sanctuary input[type=file]').setInputFiles(fileURLToPath(new URL('fixtures/sanctuary.mp4', import.meta.url)))
  await button('Add to library').click()
  await video.waitFor()
  assert.equal(await fit(), 'cover')
  assert.equal(await muted(), true)
  assert.equal(await video.evaluate(el => el.loop && el.playsInline), true)
  await pauseState(false)

  await page.evaluate(() => document.documentElement.style.setProperty('--standby-native-right', '48px'))
  const box = await video.boundingBox()
  assert.deepEqual(box, { x: 0, y: 0, width: 915, height: 412 })
  assert.equal(await audio.count(), 0)
  await touch(420, 230)
  await audio.waitFor()
  const control = await audio.boundingBox()
  assert.ok(control.width >= 44 && control.height >= 44 && control.x + control.width <= 915 - 48)
  await button('Unmute video').tap()
  assert.equal(await muted(), false)
  await audio.waitFor({ state: 'hidden', timeout: 5000 })

  await touch(420, 230, 0, 0, 720)
  await dialog.waitFor()
  assert.equal(await audio.count(), 0)
  await pauseState(true)
  await button('Fit to screen').click()
  await button('Close').click()
  assert.equal(await fit(), 'contain')
  await pauseState(false)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await pauseState(true)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await pauseState(false)

  await touch(430, 150, 0, 140)
  await photo.waitFor()
  assert.equal(await audio.count(), 0)
  await touch(430, 300, 0, -140)
  await video.waitFor()
  await touch(380, 230, 300, 0)
  await page.waitForURL('**/#/spotify')
  await page.goBack()
  await video.waitFor()
  await page.reload()
  await video.waitFor()
  assert.equal(await muted(), false)
  assert.equal(await fit(), 'contain')
  await openLibrary()
  await button('Mute video').waitFor()
  await button('Mute video').click()
  await button('Fill screen').click()
  await select('Sample photo.png')
  assert.equal(await photo.evaluate(el => getComputedStyle(el).objectFit), 'contain')
  await openLibrary()
  await select('sanctuary.mp4')
  assert.equal(await fit(), 'cover')
  assert.equal(await muted(), true)

  for (const theme of ['amoled-minimal', 'dark-fantasy-rpg']) {
    await page.goto(url + '/#/settings')
    await page.getByLabel('Theme', { exact: true }).selectOption(theme)
    await page.goto(url + '/#/sanctuary')
    await video.waitFor()
    await touch(430, 230)
    await audio.waitFor()
    if (screenshots) await page.screenshot({ path: join(screenshots, theme + '-sanctuary.png') })
    await page.goto(url + '/#/')
    await page.locator('.standby-clock').waitFor()
    assert.equal((await page.locator('.standby-clock').boundingBox()).width, 915 / 2)
    if (screenshots) await page.screenshot({ path: join(screenshots, theme + '-standby.png') })
  }
  console.log('Sanctuary regression passed: default Fill/Fit, persisted preferences, timed touch control, swipes, long press, pause/resume and both themes.')
} finally {
  await browser.close()
}
