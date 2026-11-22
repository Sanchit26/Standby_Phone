import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { StandbyDatabase } from '../src/storage/database.ts'
import { saveEvent, eventDatesInMonth } from '../src/storage/calendar.ts'
import { deviceEntries, mergeCalendarDay, mergeEventDates } from '../src/storage/calendarView.ts'
import { createDeviceCalendarStore, monthKey } from '../src/services/deviceCalendarStore.ts'

const allDay = (day, extra = {}) => ({
  calendarId: '1', eventId: '7', title: 'CV exam', allDay: true,
  begin: Date.parse(day + 'T00:00:00Z'), end: Date.parse(day + 'T00:00:00Z') + 86400000, ...extra,
})
const localEvent = (day, title = 'CV exam') => ({ day, title, description: '', allDay: true, start: '', end: '', color: '' })

test('device entries preserve UTC all-day dates, recurring instances and source-qualified identity', () => {
  const first = allDay('2026-11-25')
  const second = allDay('2026-11-27')
  const invalid = { ...second, begin: NaN }
  const device = deviceEntries([first, first, second, invalid], '2026-11-01', '2026-12-01')
  assert.equal(device.get('2026-11-25').length, 1)
  assert.equal(device.size, 2)
  assert.notEqual(device.get('2026-11-25')[0].key, device.get('2026-11-27')[0].key)
  const entries = mergeCalendarDay([{ id: '7', ...localEvent('2026-11-25') }], device.get('2026-11-25'))
  assert.deepEqual(entries.map(row => row.source), ['device', 'local'])
  assert.equal(entries[1].key, 'local:7')
})

test('local time zones, midnight and multi-day all-day occurrences use exclusive ends', () => {
  const oldZone = process.env.TZ
  process.env.TZ = 'Asia/Kolkata'
  try {
    const timed = { ...allDay('2026-11-25'), allDay: false,
      begin: Date.parse('2026-11-25T17:00Z'), end: Date.parse('2026-11-26T20:00Z') }
    const endAtMidnight = { ...timed, eventId: '8', end: Date.parse('2026-11-25T18:30Z') }
    const holiday = allDay('2026-11-25', { eventId: '9', end: Date.parse('2026-11-27T00:00Z') })
    const entries = deviceEntries([timed, endAtMidnight, holiday], '2026-11-25', '2026-11-27')
    assert.equal(entries.get('2026-11-25')[0].start, '22:30')
    assert.equal(entries.get('2026-11-26')[0].continuation, true)
    assert.equal(entries.get('2026-11-26').some(row => row.device.eventId === '8'), false)
    assert.equal(entries.get('2026-11-26').some(row => row.device.eventId === '9'), true)
    assert.equal(entries.has('2026-11-27'), false)
    process.env.TZ = 'America/Los_Angeles'
    const date = deviceEntries([allDay('2026-11-25')], '2026-11-24', '2026-11-27')
    assert.deepEqual([...date.keys()], ['2026-11-25'])
  } finally {
    if (oldZone === undefined) delete process.env.TZ
    else process.env.TZ = oldZone
  }
})

test('event dots combine selected device dates and locally saved dates', async t => {
  const db = new StandbyDatabase(crypto.randomUUID())
  t.after(() => db.delete())
  await saveEvent(db, localEvent('2026-11-24'))
  await saveEvent(db, localEvent('2026-11-25'))
  const local = await eventDatesInMonth(db, 2026, 10)
  const device = deviceEntries([allDay('2026-11-25'), allDay('2026-11-27')], '2026-11-01', '2026-12-01')
  assert.deepEqual(mergeEventDates(local, device), new Set(['2026-11-24', '2026-11-25', '2026-11-27']))
  assert.deepEqual(mergeEventDates(local), new Set(['2026-11-24', '2026-11-25']))
})

function fixture() {
  const state = { permission: 'prompt', calendars: [], events: [], requests: 0, queries: [] }
  const store = createDeviceCalendarStore({
    checkPermissions: async () => ({ calendar: state.permission }),
    requestAccess: async () => { state.requests++; return { calendar: state.permission } },
    calendars: async () => ({ calendars: state.calendars }),
    instances: async query => { state.queries.push(query); return { events: state.events } },
    viewEvent: async () => {},
  })
  return { state, store }
}

test('permissions are checked without prompting and denial keeps device queries off', async () => {
  const { store, state } = fixture()
  store.configure(true, ['1'])
  state.permission = 'prompt-with-rationale'
  await store.refresh()
  assert.equal(store.snapshot().access, 'prompt-with-rationale')
  assert.equal(state.requests, 0)
  state.permission = 'denied'
  assert.equal(await store.requestAccess(), 'denied')
  assert.equal(state.requests, 1)
  assert.equal(store.snapshot().access, 'denied')
  assert.equal(state.queries.length, 0)
  assert.equal(await createDeviceCalendarStore().requestAccess(), 'unsupported')
})

test('empty provider, selected-only refresh, cancellation and disabling clear device data', async () => {
  const { store, state } = fixture()
  store.configure(true, ['1', '2'])
  state.permission = 'granted'
  await store.inspect()
  assert.deepEqual(store.snapshot().calendars, [])
  await store.visit(2026, 10)
  assert.equal(state.queries.length, 0)
  state.calendars = [{ id: '1', name: 'Personal' }, { id: '3', name: 'Unselected' }]
  state.events = [allDay('2026-11-25'), allDay('2026-11-26', { calendarId: '3' })]
  await store.inspect()
  await Promise.all([store.visit(2026, 10), store.visit(2026, 10)])
  assert.deepEqual(state.queries[0].ids, ['1'])
  assert.equal(state.queries.length, 1)
  assert.ok(state.queries[0].end - state.queries[0].begin < 40 * 86400000)
  const key = monthKey(2026, 10)
  assert.deepEqual([...store.month(key).keys()], ['2026-11-25'])
  state.events = []
  await store.visit(2026, 10)
  assert.equal(store.month(key).size, 0)
  store.configure(false, ['1', '2'])
  await store.refresh()
  assert.equal(store.month(key), undefined)
  assert.equal(store.snapshot().refreshedAt, undefined)
  assert.equal(state.queries.length, 2)
})

test('a stale provider response cannot restore device events after disabling', async () => {
  let respond
  const store = createDeviceCalendarStore({
    checkPermissions: async () => ({ calendar: 'granted' }),
    calendars: async () => ({ calendars: [{ id: '1', name: 'Personal' }] }),
    instances: () => new Promise(resolve => { respond = resolve }),
  })
  store.configure(true, ['1'])
  await store.inspect()
  const pending = store.visit(2026, 10)
  await Promise.resolve()
  store.configure(false, ['1'])
  respond({ events: [allDay('2026-11-25')] })
  await pending
  assert.equal(store.month(monthKey(2026, 10)), undefined)
})
