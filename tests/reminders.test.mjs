import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { StandbyDatabase } from '../src/storage/database.ts'
import { createReminderRepository, dailyOccurrence, graceMs, intervalOccurrence } from '../src/services/reminders.ts'

async function fixture(t) {
  const db = new StandbyDatabase(crypto.randomUUID())
  t.after(() => db.delete())
  await db.open()
  return { db, repo: createReminderRepository(db) }
}

test('one-time schedule survives reboot and a concurrent claim is recorded once', async t => {
  const { db, repo } = await fixture(t)
  const now = Date.now(), at = now + 15_000
  const id = await repo.save({ message: 'Read notes', schedule: { kind: 'once', at }, voice: 'offline-en', rate: 1.2, volume: .8 }, undefined, now)
  assert.deepEqual(await repo.reconcile(at - 1), [])
  db.close()
  await db.open()
  assert.equal((await repo.list())[0].voice, 'offline-en')
  const claims = (await Promise.all([repo.reconcile(at), repo.reconcile(at), repo.reconcile(at)])).flat()
  assert.equal(claims.length, 1)
  const { delivery } = claims[0]
  assert.equal(delivery.status, 'pending')
  assert.equal(delivery.triggeredAt, undefined)
  await repo.markStarted(delivery.id, at + 500)
  await repo.finish(delivery.id, { status: 'spoken' })
  const [result] = await repo.history()
  assert.deepEqual([result.reminderId, result.scheduledAt, result.triggeredAt, result.status], [id, at, at + 500, 'spoken'])
  assert.equal((await repo.list())[0].enabled, false)
  await repo.clearHistory()
  assert.deepEqual(await repo.history(), [])
  assert.equal((await repo.list()).length, 1)
  assert.deepEqual(await repo.reconcile(at + 1), [])
})

test('daily recurrence stays on the selected local wall-clock time and avoids repeated days', async t => {
  const { repo } = await fixture(t)
  const now = +new Date(2026, 10, 23, 19, 45)
  const first = +new Date(2026, 10, 23, 20)
  const tomorrow = +new Date(2026, 10, 24, 20)
  const id = await repo.save({ message: 'Review', schedule: { kind: 'daily', time: '20:00' } }, undefined, now)
  assert.equal((await repo.list())[0].scheduledAt, first)
  assert.equal((await repo.reconcile(first + 250))[0].delivery.scheduledAt, first)
  assert.equal((await repo.list())[0].scheduledAt, tomorrow)
  await repo.setEnabled(id, false, first + 500)
  await repo.setEnabled(id, true, now)
  assert.equal((await repo.list())[0].scheduledAt, tomorrow)
  assert.equal(dailyOccurrence('20:00', now, '2026-11-25'), +new Date(2026, 10, 26, 20))
})

test('resume skips stale interval occurrences and preserves the original cadence', async t => {
  const { db, repo } = await fixture(t)
  const now = Date.now()
  const id = await repo.save({ message: 'Water', schedule: { kind: 'interval', minutes: 5 } }, undefined, now)
  await repo.save({ message: 'Water break', schedule: { kind: 'interval', minutes: 5 } }, id, now + 60_000)
  assert.equal((await db.reminders.get(id)).scheduledAt, now + 5 * 60_000)
  const resumed = now + 17 * 60_000
  assert.deepEqual(await repo.reconcile(resumed), [])
  const [skipped] = await repo.history()
  assert.equal(skipped.status, 'skipped')
  assert.equal(skipped.triggeredAt, undefined)
  const next = now + 20 * 60_000
  assert.equal((await db.reminders.get(id)).scheduledAt, next)
  assert.equal((await repo.reconcile(next + graceMs))[0].delivery.scheduledAt, next)
  assert.equal((await db.reminders.get(id)).scheduledAt, now + 25 * 60_000)
})

test('disabled reminders stay silent and invalid schedules are rejected', async t => {
  const { repo } = await fixture(t)
  const now = Date.now(), at = now + 1000
  const id = await repo.save({ message: 'Paused', schedule: { kind: 'once', at } }, undefined, now)
  await repo.setEnabled(id, false, now)
  assert.deepEqual(await repo.reconcile(at), [])
  await assert.rejects(repo.setEnabled(id, true, at + 1), /future/)
  await repo.save({ message: 'Edited', schedule: { kind: 'once', at: at + 60_000 } }, id, at)
  assert.equal((await repo.list())[0].enabled, false)
  await repo.setEnabled(id, true, at)
  assert.equal((await repo.list())[0].enabled, true)
  for (const minutes of [0, 4, 5.5, Infinity, -10]) assert.throws(() => intervalOccurrence(minutes, now), /whole interval/)
  assert.throws(() => dailyOccurrence('25:00', now), /valid local time/)
  await assert.rejects(repo.save({ message: ' ', schedule: { kind: 'once', at } }, undefined, now), /message/)
  await assert.rejects(repo.save({ message: 'Test', schedule: { kind: 'once', at }, rate: 15 }, undefined, now), /rate/)
})

test('simultaneous reminders are ordered by occurrence and ID, with a bounded queue', async t => {
  const { repo } = await fixture(t)
  const now = Date.now(), at = now + 1000
  const ids = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    repo.save({ message: 'Reminder ' + i, schedule: { kind: 'once', at } }, undefined, now)))
  const claims = await repo.reconcile(at)
  assert.deepEqual(claims.map(claim => claim.reminder.id), ids.sort().slice(0, 4))
  assert.equal((await repo.history()).filter(row => row.status === 'skipped').length, 1)
  const first = claims[0].delivery.id
  await repo.markStarted(first, at + 1)
  await repo.finish(first, { status: 'silenced' })
  await repo.finish(first, { status: 'spoken' })
  assert.equal((await repo.history()).find(row => row.id === first).status, 'silenced')
  await repo.clearHistory()
  assert.equal((await repo.history()).length, 3)
})

test('legacy version 6 reminders migrate with IDs, and old acknowledgments stay unconfirmed', async t => {
  const name = crypto.randomUUID()
  const old = new Dexie(name)
  old.version(6).stores({
    categories: 'id, sortOrder', tasks: 'id, categoryId, parentId, sortOrder, dueDate',
    focusSessions: 'id, startedAt, taskId, endedAt', timerState: 'id', xpEvents: 'id, timestamp, [source+categoryId]',
    achievements: 'id, unlockedAt', reminders: 'id, scheduledAt, [channel+scheduledAt], deliveredAt',
    events: 'id, day', media: 'id, sortOrder', mediaBlobs: 'id', librarySettings: 'id', deliveries: 'id, scheduledAt, reminderId',
  })
  const now = Date.now()
  const base = { channel: 'in-app', title: 'Read notes', scheduledAt: now, enabled: true, createdAt: now, updatedAt: now }
  await old.table('reminders').bulkAdd([{ ...base, id: 'past', deliveredAt: now }, { ...base, id: 'pending' }])
  old.close()
  const db = new StandbyDatabase(name)
  t.after(() => db.delete())
  const repo = createReminderRepository(db)
  const [record] = await repo.history()
  assert.equal(record.status, 'unconfirmed')
  assert.equal(record.reminderId, 'past')
  assert.equal((await db.reminders.get('past')).enabled, false)
  assert.equal((await repo.reconcile(now))[0].reminder.id, 'pending')
})

test('an interrupted pending claim is not replayed after a database reopen', async t => {
  const { db, repo } = await fixture(t)
  const now = Date.now(), at = now + 1000
  await repo.save({ message: 'Resume', schedule: { kind: 'once', at } }, undefined, now)
  const [claim] = await repo.reconcile(at)
  await repo.markStarted(claim.delivery.id, at)
  db.close()
  await db.open()
  assert.deepEqual(await repo.reconcile(at + 500), [])
  assert.equal((await repo.history())[0].status, 'pending')
})

test('daily reconciliation detects a changed time zone without replaying an already delivered local day', async t => {
  const { db, repo } = await fixture(t)
  const now = +new Date(2026, 10, 23, 19)
  const at = +new Date(2026, 10, 23, 20)
  const id = await repo.save({ message: 'Study', schedule: { kind: 'daily', time: '20:00' } }, undefined, now)
  assert.equal((await repo.reconcile(at)).length, 1)
  assert.deepEqual(await repo.reconcile(at, 'Changed zone'), [])
  const row = await db.reminders.get(id)
  assert.equal(row.timezone, 'Changed zone')
  assert.equal(row.scheduledAt, +new Date(2026, 10, 24, 20))
})
