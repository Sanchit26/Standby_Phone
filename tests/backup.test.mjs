import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import { StandbyDatabase } from '../src/storage/database.ts'
import { createBackup } from '../src/storage/backup.ts'
import { createTaskRepository } from '../src/storage/taskRepository.ts'
import { createReminderRepository } from '../src/services/reminders.ts'
import { saveEvent } from '../src/storage/calendar.ts'

test('versioned JSON exports stable task links and local data, with no provider IDs, XP or media', async t => {
  const db = new StandbyDatabase(crypto.randomUUID())
  t.after(() => db.delete())
  const tasks = createTaskRepository(db)
  const categoryId = await tasks.saveCategory({ name: 'Revision' })
  const parentId = await tasks.saveTask({ categoryId, title: 'Read' })
  const leafId = await tasks.saveTask({ categoryId, parentId, title: 'Take notes' })
  const eventId = await saveEvent(db, { title: 'Exam', day: '2026-11-25', description: '', allDay: true, start: '', end: '', color: '' })
  await db.focusSessions.add({ id: 'focus', startedAt: 100, createdAt: 100, updatedAt: 100 })
  const reminderId = await createReminderRepository(db).save({ message: 'Review', schedule: { kind: 'daily', time: '20:00' } })
  await db.xpEvents.add({ id: 'historic-xp' })
  await db.mediaBlobs.add({ id: 'media', blob: new Blob(['image']) })
  const prefs = { theme: 'amoled-minimal', deviceCalendar: { enabled: true, ids: ['1234'] } }
  const exported = JSON.parse(JSON.stringify(await createBackup(db, prefs, 100)))
  assert.equal(exported.format, 'standby-backup')
  assert.equal(exported.version, 1)
  assert.equal(Date.parse(exported.exportedAt), 100)
  assert.deepEqual(exported.display, { theme: 'amoled-minimal' })
  assert.equal(exported.categories[0].id, categoryId)
  assert.equal(exported.tasks.find(row => row.id === leafId).parentId, parentId)
  assert.equal(exported.events[0].id, eventId)
  assert.equal(exported.focusSessions[0].id, 'focus')
  assert.equal(exported.reminders[0].id, reminderId)
  assert.equal(Object.hasOwn(exported, 'xpEvents'), false)
  assert.equal(Object.hasOwn(exported, 'mediaBlobs'), false)
})
