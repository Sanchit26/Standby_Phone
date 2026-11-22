import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { db, StandbyDatabase } from '../src/storage/database.ts'
import { eventDatesInMonth, saveEvent } from '../src/storage/calendar.ts'
import { importMedia, library, loadMedia, preferred, removeMedia, reorderMedia, resolveMedia,
  selection, selectMedia, setDefault, validateMedia } from '../src/storage/media.ts'

test('month indicators track create, edit and final deletion across a year boundary', async t => {
  const calendar = new StandbyDatabase('month-indicators')
  t.after(() => calendar.delete())
  const event = day => ({ day, title: 'Exam', description: '', allDay: true, start: '', end: '', color: '' })
  const december = () => eventDatesInMonth(calendar, 2026, 11)
  const january = () => eventDatesInMonth(calendar, 2027, 0)
  const first = await saveEvent(calendar, event('2026-12-31'))
  const second = await saveEvent(calendar, event('2026-12-31'))
  await saveEvent(calendar, event('2026-11-30'))
  assert.deepEqual(await december(), new Set(['2026-12-31']))
  await saveEvent(calendar, event('2027-01-01'), first)
  assert.deepEqual(await january(), new Set(['2027-01-01']))
  assert.deepEqual(await december(), new Set(['2026-12-31']))
  await calendar.events.delete(second)
  assert.deepEqual(await december(), new Set())
  calendar.close()
  await calendar.open()
  assert.deepEqual(await january(), new Set(['2027-01-01']))
})

test('media fallback keeps bytes, ordering, selection and defaults across reopen', async t => {
  t.after(() => db.delete())
  const first = await importMedia(new File(['image'], 'first.png', { type: 'image/png' }))
  const second = await importMedia(new File(['video'], 'second.mp4', { type: 'video/mp4' }))
  assert.equal(await preferred(), first)
  assert.equal(await selection(), second)
  await reorderMedia(second, -1)
  await setDefault(second)
  await selectMedia('quote')
  db.close()
  await db.open()
  const items = await library()
  assert.deepEqual(items.map(item => item.id), [second, first])
  assert.equal(items[0].storage, 'blob')
  assert.equal(await (await loadMedia(items[0])).text(), 'video')
  assert.equal(await selection(), 'quote')
  assert.equal(await preferred(), second)
  assert.equal(resolveMedia(['intro', 'quote', first, second], 'missing', second), second)
  await selectMedia(second)
  await removeMedia(items[0])
  assert.equal(await selection(), undefined)
  assert.equal(await preferred(), undefined)
  await assert.rejects(loadMedia(items[0]), /unavailable/)
  assert.equal((await library())[0].id, first)
})

test('empty, oversized and unsupported files are rejected before decoding', () => {
  assert.throws(() => validateMedia(new File([], 'empty.png', { type: 'image/png' })), /empty/)
  assert.throws(() => validateMedia(new File(['x'], 'text.txt', { type: 'text/plain' })), /Choose a/)
  assert.throws(() => validateMedia({ type: 'video/mp4', size: 513 * 1024 * 1024 }), /512 MiB/)
})
