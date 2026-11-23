// Presentation tests using a simulated Capacitor plugin. No private device data is used.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = process.env.STANDBY_PLAYWRIGHT_MODULE
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright-core')
const browser = await chromium.launch({ executablePath: process.env.STANDBY_BROWSER })
const url = process.env.STANDBY_TEST_URL ?? 'http://127.0.0.1:4173'
const screenshots = process.env.STANDBY_SCREENSHOTS
if (screenshots) await mkdir(screenshots, { recursive: true })

try {
  for (const theme of ['amoled-minimal', 'dark-fantasy-rpg']) {
    const page = await browser.newPage({
      viewport: { width: 800, height: 360 },
      reducedMotion: theme === 'dark-fantasy-rpg' ? 'reduce' : 'no-preference',
    })
    await page.addInitScript(
      ({ theme }) => {
        if (!localStorage.getItem('CapacitorStorage.display')) {
          localStorage.setItem('CapacitorStorage.display', JSON.stringify({ theme, widget: 'media' }))
        }
        const state = {
          revision: 1,
          role: 'receiver',
          name: 'Dashboard',
          paired: true,
          running: true,
          connected: true,
          peerName: 'Test sender',
          status: 'Connected',
          access: true,
          apps: [],
          rows: [],
          banners: true,
          minutes: 30,
          media: {
            status: 'active',
            title: 'Test track',
            artist: 'Test artist',
            album: 'Test record',
            playing: false,
            actions: 4 | 16 | 32 | 256,
            duration: 180000,
            position: 5000,
            state: 2,
          },
          banner: '',
          callId: '',
          call: '',
          callSource: '',
        }
        let notify = () => {}
        window.updatePhoneTest = (patch) => {
          Object.assign(state, patch)
          state.revision++
          notify({})
        }
        window.CapacitorCustomPlatform = { name: 'android' }
        window.Capacitor = {
          PluginHeaders: [
            {
              name: 'PhoneLink',
              methods: [
                ...['snapshot', 'action', 'applications'].map((name) => ({ name, rtype: 'promise' })),
                { name: 'addListener' },
              ],
            },
          ],
          nativeCallback(_plugin, _method, _opts, callback) {
            notify = callback
            return 'listener'
          },
          async nativePromise(_plugin, method, opts) {
            if (method === 'snapshot') return structuredClone(state)
            if (method === 'applications') return { apps: [] }
            if (method === 'action') window.lastPhoneAction = opts
          },
        }
      },
      { theme },
    )
    const capture = async (name) => {
      if (screenshots)
        await page.screenshot({
          path: join(screenshots, theme + '-' + name + '.png'),
          animations: 'disabled',
        })
    }
    const navigate = async (route, selector) => {
      await page.evaluate((path) => {
        location.hash = path
      }, route)
      await page.locator(selector).waitFor()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    }
    await page.goto(url + '/#/spotify')
    await page.getByText('Test track', { exact: true }).waitFor()
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
    const art = await page.locator('.spotify-art').boundingBox()
    const controls = await page.locator('.spotify-controls').boundingBox()
    assert.ok(Math.abs(art.width - art.height) < 2 && art.x + art.width < controls.x)
    assert.ok(controls.y >= 0 && controls.y + controls.height <= 360)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    assert.equal(await page.evaluate(() => window.lastPhoneAction.value), 'play')
    await capture('spotify')
    await page.evaluate(() => {
      location.hash = '/'
    })
    await page.locator('.spotify-player.compact').waitFor()
    const compact = await page.locator('.spotify-player.compact').boundingBox()
    assert.ok(compact.x >= 380 && compact.x + compact.width <= 800)
    await capture('compact')
    const widget = page.locator('.widget-carousel')
    await widget.focus()
    await widget.press('ArrowDown')
    await page.locator('.remote-inbox').waitFor()
    await page.evaluate(() =>
      window.updatePhoneTest({
        banner: 'new',
        rows: [
          {
            id: 'one',
            pkg: 'test.app',
            app: 'Test app',
            title: 'Meeting',
            text: 'Test preview',
            time: Date.now(),
            icon: '',
          },
        ],
      }),
    )
    await page.locator('.remote-banner').waitFor()
    await capture('banner')
    await widget.focus()
    await widget.press('Enter')
    await page.getByText('Test preview', { exact: true }).waitFor()
    await capture('inbox')
    await page.evaluate(() => window.updatePhoneTest({ callId: 'episode', call: 'Incoming Call' }))
    const call = page.getByRole('dialog', { name: 'Incoming Call' })
    await call.getByText('Unknown caller').waitFor()
    assert.equal(await page.locator('.remote-banner').isVisible(), false)
    const icon = call.locator(theme === 'dark-fantasy-rpg' ? '.call-fantasy-icon' : '.call-minimal-icon')
    assert.ok(await icon.isVisible())
    await capture('incoming-call')
    await call.getByRole('button', { name: 'Close' }).click()
    await call.waitFor({ state: 'hidden' })
    assert.ok(await page.getByText('Test preview', { exact: true }).isVisible())
    await page.evaluate(() =>
      window.updatePhoneTest({ callId: 'whatsapp', call: 'Incoming Call', callSource: 'WhatsApp' }),
    )
    await call.getByText('WhatsApp · Ringing on Test sender').waitFor()
    await capture('whatsapp')
    await page.evaluate(() => window.updatePhoneTest({ callId: '', call: '', callSource: '', banner: '' }))
    await call.waitFor({ state: 'hidden' })
    await page.keyboard.press('Escape')
    for (const [width, height] of [
      [800, 360],
      [915, 412],
      [960, 432],
      [1440, 720],
    ]) {
      await page.setViewportSize({ width, height })
      await page.evaluate(() => document.documentElement.style.setProperty('--standby-native-right', '32px'))
      await navigate('/', '.standby-clock')
      const clock = await page.locator('.standby-clock').boundingBox()
      assert.ok(clock.x + clock.width <= width * 0.55)
      await capture('standby-' + width)
      await navigate('/calendar', '.calendar-page')
      await capture('calendar-' + width)
      await navigate('/sanctuary', '.sanctuary')
      await capture('sanctuary-' + width)
      await navigate('/spotify', '.media-page')
      await page.evaluate(() => window.updatePhoneTest({ media: { status: 'absent' } }))
      await page.getByText(/No active Spotify session/).waitFor()
      assert.ok(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      await capture('spotify-empty-' + width)
      await page.evaluate(() => {
        const canvas = Object.assign(document.createElement('canvas'), { width: 176, height: 176 })
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#34485e'
        ctx.fillRect(0, 0, 176, 176)
        ctx.fillStyle = '#d2ac72'
        ctx.fillRect(32, 40, 112, 96)
        window.updatePhoneTest({
          media: {
            status: 'active',
            title: 'A track with a longer display name',
            artist: 'Test artist',
            album: 'Test record',
            art: canvas.toDataURL(),
            playing: true,
            state: 3,
            position: 12000,
            duration: 180000,
            actions: 2 | 16 | 32 | 256,
          },
        })
      })
      const image = page.getByRole('img', { name: 'Album artwork' })
      await image.waitFor()
      const square = await image.boundingBox()
      const row = await page.locator('.spotify-controls').boundingBox()
      assert.ok(Math.abs(square.width - square.height) < 2 && square.x + square.width < row.x)
      assert.ok(row.x + row.width < width && row.y + row.height <= height)
      await capture('spotify-playing-' + width)
    }
    await page.setViewportSize({ width: 915, height: 412 })
    await page.evaluate(() =>
      window.updatePhoneTest({
        paired: false,
        connected: false,
        code: 'example-pairing-code',
        candidate: 'candidate',
        status: 'Approve Test sender',
      }),
    )
    await navigate('/settings', '.phone-settings')
    const approval = page.getByRole('button', { name: 'Approve sender' })
    await approval.scrollIntoViewIfNeeded()
    await capture('receiver-pairing')
    await approval.click()
    assert.equal(await page.evaluate(() => window.lastPhoneAction.action), 'approve')
    if (theme === 'amoled-minimal') {
      await navigate('/', '.standby-clock')
      const clock = await page.locator('.standby-clock').boundingBox()
      await page.mouse.move(clock.x + clock.width / 2, clock.y + clock.height / 2)
      await page.mouse.down()
      await page.locator('.clock-gallery').waitFor()
      await page.mouse.up()
      assert.ok((await page.locator('.face-option').count()) > 1)
      await page.keyboard.press('Escape')
      await page.locator('.clock-gallery').waitFor({ state: 'hidden' })
      await page.mouse.move(clock.x + clock.width / 2, clock.y + clock.height / 2)
      await page.mouse.down()
      await page.mouse.move(clock.x + clock.width / 2 - 110, clock.y + clock.height / 2, { steps: 6 })
      await page.mouse.up()
      await page.locator('.quest-hub').waitFor()
      await page.getByRole('button', {name:'Add To-Do List'}).click()
      await page.getByLabel('Category name').fill('QA list')
      await page.getByRole('button', {name:'Save',exact:true}).click()
      await page.getByRole('button', {name:'Start Task'}).click()
      await page.getByRole('button', {name:'Open focus timer'}).click()
      const timer = page.getByRole('dialog', {name:'Focus timer'})
      await timer.getByRole('button', {name:'Stopwatch',exact:true}).click()
      await timer.getByRole('button', {name:'Start session'}).click()
      await timer.getByRole('button', {name:'Pause',exact:true}).click()
      await timer.getByRole('button', {name:'Finish now'}).click()
      await timer.getByText(/Complete/).waitFor()
      await page.keyboard.press('Escape')
      await timer.waitFor({state:'hidden'})
      await page.reload()
      await page.locator('.widget-carousel').getByText('QA list',{exact:true}).waitFor()
    }
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--standby-native-right')
      window.updatePhoneTest({
        callId: '',
        call: '',
        role: 'sender',
        paired: true,
        connected: true,
        code: '',
        candidate: '',
        name: 'Test sender',
        peerName: 'Dashboard',
        status: 'Connected',
      })
    })
    await page.setViewportSize({ width: 360, height: 800 })
    await page.getByRole('heading', { name: 'Phone sharing' }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await capture('portrait-sender')
    await page.close()
  }
  const standby = await browser.newPage({viewport:{width:915,height:412}})
  await standby.clock.install()
  await standby.goto(url + '/#/')
  await standby.locator('.standby-clock').waitFor()
  await standby.clock.fastForward(181000)
  const shift = await standby.locator('html').evaluate(root=>['--oled-x','--oled-y'].map(key=>parseInt(root.style.getPropertyValue(key))))
  assert.ok(shift.every(value=>Math.abs(value)<=4))
  await standby.clock.fastForward(721000)
  assert.equal(await standby.locator('html').getAttribute('data-oled-dimmed'),'')
  await standby.mouse.move(18, 100)
  assert.equal(await standby.locator('html').getAttribute('data-oled-dimmed'),null)
  await standby.close()
  console.log(
    'PASS: both themes, four landscape sizes, alert priority, Spotify, portrait sender, clock gestures, Quest Hub, timer persistence and OLED browser dimming',
  )
} finally {
  await browser.close()
}
