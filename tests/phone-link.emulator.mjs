// Run explicitly on two disposable, running emulators with the debug APK open.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
const adbFile = process.env.ADB || 'adb'
const adb = (serial, ...args) => execFileSync(adbFile, ['-s', serial, ...args], { encoding: 'utf8' }).trim()
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function connect(port) {
  const [tab] = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
  const socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    socket.onopen = r
    socket.onerror = j
  })
  const pending = new Map()
  let next = 0
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(data)
    const complete = pending.get(event.id)
    if (complete) {
      pending.delete(event.id)
      complete(event)
    }
  }
  const js = async (expression) => {
    const id = ++next
    const result = await new Promise((resolve) => {
      pending.set(id, resolve)
      socket.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      )
    })
    if (result.error || result.result?.exceptionDetails) throw Error('WebView bridge action failed')
    return result.result.result.value
  }
  return {
    js,
    close: () => socket.close(),
    snap: () => js('Capacitor.Plugins.PhoneLink.snapshot()'),
    act: (action, value = '', position = 0) =>
      js('Capacitor.Plugins.PhoneLink.action(' + JSON.stringify({ action, value, position }) + ')'),
  }
}
const wait = async (fn, label, timeout = 20000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const result = await fn()
    if (result) return result
    await pause(240)
  }
  throw Error(label)
}

const [receiver, sender] = process.argv.slice(2)
if (![receiver, sender].every((serial) => /^emulator-\d+$/.test(serial)) || receiver === sender)
  throw Error('Pass two different disposable emulator serials, receiver then sender')
function forward(serial) {
  const pid = adb(serial, 'shell', 'pidof', 'com.standby.productivity')
  assert.match(pid, /^\d+$/)
  return Number(adb(serial, 'forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid))
}
const rp = forward(receiver)
let sp = forward(sender)
const r = await connect(rp)
let s = await connect(sp)
let testing = false,
  ringing = false,
  wifiOff = false
const connectBoth = () =>
  wait(async () => (await r.snap()).connected && (await s.snap()).connected, 'Both peers must connect')
async function enroll() {
  const code = await wait(async () => (await r.snap()).code, 'Receiver must issue a challenge')
  await s.act('start', code)
  const id = await wait(async () => (await r.snap()).candidate, 'Receiver approval required')
  assert.equal((await r.snap()).connected, false)
  await r.act('approve', id)
  await connectBoth()
}
try {
  for (const device of [r, s]) {
    const state = await device.snap()
    assert.ok(!state.running && !state.paired, 'Test requires unused, stopped, unpaired emulators')
  }
  testing = true
  await r.act('role', 'receiver')
  await s.act('role', 'sender')
  await s.act('calls', 'true')
  await s.act('music', 'true')
  await s.act('previews', 'false')
  if (!(await s.snap()).apps.includes('com.android.shell')) await s.act('apps', 'com.android.shell')
  adb(sender, 'shell', 'cmd', 'notification', 'allow_listener', 'com.standby.productivity/.PhoneListener')
  adb(sender, 'shell', 'pm', 'grant', 'com.standby.productivity', 'android.permission.READ_PHONE_STATE')
  await r.act('start')
  const code = await wait(async () => (await r.snap()).code, 'Pairing window')
  const host = await wait(async () => (await r.snap()).address, 'Receiver Wi-Fi address')
  await s.act('host', host)
  const wrong = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0')
  await s.act('start', wrong)
  await wait(async () => (await r.snap()).status.includes('incorrect'), 'Wrong challenge rejection')
  assert.ok(!(await r.snap()).candidate)
  await s.act('stop')
  const wrongPin = (code.startsWith('A') ? 'B' : 'A') + code.slice(1)
  await s.act('start', wrongPin)
  await wait(async () => (await s.snap()).status.includes('interrupted'), 'Untrusted certificate rejection')
  assert.ok(!(await r.snap()).connected)
  await s.act('stop')
  await wait(async () => !(await r.snap()).code, 'Challenge expiry', 125000)
  await s.act('start', code)
  await wait(
    async () => (await s.snap()).status.includes('interrupted'),
    'Expired enrollment must reject TLS',
  )
  assert.ok(!(await r.snap()).candidate)
  await s.act('stop')
  await r.act('start')
  await enroll()
  assert.equal((await s.snap()).access, true)
  await wait(async () => (await r.snap()).media.status === 'absent', 'Clean emulator has no Spotify session')
  await r.act('command', 'next')
  await wait(
    async () => (await r.snap()).result === 'Spotify session changed',
    'Authenticated media command refusal',
  )
  const priorIds = new Set((await r.snap()).rows.map((row) => row.id))
  const tag = 'standby-qa-' + Date.now()
  adb(sender, 'shell', 'cmd', 'notification', 'post', '-t', 'TestNotice', tag, 'First')
  const note = await wait(
    async () => (await r.snap()).rows.find((row) => row.pkg === 'com.android.shell' && !priorIds.has(row.id)),
    'Notification delivery',
  )
  assert.equal(note.text, '')
  adb(sender, 'shell', 'cmd', 'notification', 'post', '-t', 'TestNotice', tag, 'Updated')
  await pause(800)
  assert.equal((await r.snap()).rows.filter((x) => x.id === note.id).length, 1)
  const sourceKey = adb(sender, 'shell', 'cmd', 'notification', 'list')
    .split(/\r?\n/)
    .find((key) => key.includes('|com.android.shell|') && key.includes('|' + tag + '|'))
  assert.ok(sourceKey, 'Source test notification should exist')
  assert.match(sourceKey, /^[\w.|:-]+$/)
  adb(sender, 'shell', 'cmd notification snooze --for 60000 ' + "'" + sourceKey + "'")
  await wait(async () => !(await r.snap()).rows.some((x) => x.id === note.id), 'Android listener removal')
  await s.act('stop')
  await s.act('apps', 'com.android.shell')
  await s.act('start')
  await connectBoth()
  adb(sender, 'shell', 'cmd', 'notification', 'post', '-t', 'Excluded', 'standby-excluded', 'Hidden')
  await pause(900)
  assert.ok(
    !(await r.snap()).rows.some((x) => x.pkg === 'com.android.shell'),
    'Allowlist should exclude shell',
  )
  await s.act('stop')
  await s.act('apps', 'com.android.shell')
  await s.act('start')
  await connectBoth()
  await wait(async () => (await r.snap()).rows.length > 0, 'Quiet replay of active notifications')
  assert.equal((await r.snap()).banner, '')
  await r.act('clear')
  assert.equal((await r.snap()).rows.length, 0)
  adb(sender, 'shell', 'input', 'keyevent', 'KEYCODE_SLEEP')
  adb(sender, 'emu', 'gsm', 'call', '15550101001')
  ringing = true
  const episode = await wait(async () => (await r.snap()).callId, 'Simulated ringing on locked sender')
  await wait(() => r.js("!!document.querySelector('.remote-call')"), 'Visible call overlay')
  await r.js('document.querySelector(\'dialog[aria-label="Incoming Call"] button\').click()')
  assert.ok((await r.snap()).callId)
  // Interrupt the sender's radio with a live, locally dismissed call.
  adb(sender, 'shell', 'svc', 'wifi', 'disable')
  wifiOff = true
  await wait(
    async () => !(await r.snap()).connected && !(await r.snap()).callId,
    'Interrupted call must clear',
    40000,
  )
  adb(sender, 'shell', 'svc', 'wifi', 'enable')
  wifiOff = false
  await wait(
    async () => (await r.snap()).callId === episode && (await s.snap()).connected,
    'Ringing identity after Wi-Fi recovery',
    60000,
  )
  assert.equal(await r.js("!!document.querySelector('.remote-call')"), false)
  adb(sender, 'emu', 'gsm', 'cancel', '15550101001')
  ringing = false
  await wait(async () => !(await r.snap()).callId, 'Ringing must end')
  adb(sender, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
  adb(sender, 'shell', 'wm', 'dismiss-keyguard')
  await r.act('stop')
  await wait(async () => !(await s.snap()).connected, 'Disconnect detection')
  await r.act('start')
  await connectBoth()
  assert.equal((await r.snap()).candidate, '')
  s.close()
  adb(sender, 'forward', '--remove', 'tcp:' + sp)
  adb(sender, 'shell', 'am', 'force-stop', 'com.standby.productivity')
  await wait(async () => !(await r.snap()).connected, 'Disconnect after process death')
  adb(sender, 'shell', 'am', 'start', '-W', '-n', 'com.standby.productivity/.MainActivity')
  sp = forward(sender)
  s = await connect(sp)
  assert.equal((await s.snap()).paired, true)
  assert.equal((await s.snap()).running, false)
  await s.act('start')
  await connectBoth()
  assert.equal((await r.snap()).candidate, '')
  await r.act('unpair')
  await r.act('start')
  await wait(async () => (await r.snap()).status.includes('incorrect'), 'Revoked peer rejected')
  assert.equal((await r.snap()).paired, false)
  console.log(
    'PASS: wrong challenge, wrong certificate, expiry, approval, native notification, locked GSM alert, local dismissal, interruption, pinned reconnect and revocation',
  )
} finally {
  if (testing) {
    if (wifiOff) adb(sender, 'shell', 'svc', 'wifi', 'enable')
    if (ringing) adb(sender, 'emu', 'gsm', 'cancel', '15550101001')
    adb(sender, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    await s.act('unpair')
    await r.act('unpair')
  }
  r.close()
  s.close()
  adb(receiver, 'forward', '--remove', 'tcp:' + rp)
  adb(sender, 'forward', '--remove', 'tcp:' + sp)
}
