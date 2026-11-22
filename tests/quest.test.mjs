import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import test from 'node:test'
import assert from 'node:assert/strict'
import { StandbyDatabase } from '../src/storage/database.ts'
import { createTaskRepository } from '../src/storage/taskRepository.ts'
import { createFocusRepository } from '../src/storage/focusRepository.ts'
import { buildTaskTree } from '../src/storage/taskTree.ts'
import { activity, dailyQuests, levelProgress, localDay, streaks } from '../src/storage/questEngine.ts'
import { reconcileHistory } from '../src/storage/questLedger.ts'

async function fixture(t) {
  const db = new StandbyDatabase(crypto.randomUUID())
  t.after(() => db.delete())
  await db.open()
  return db
}

test('level progress uses increasing costs and exact boundaries', () => {
  assert.deepEqual([0, 99, 100, 249, 250, 450].map(n => levelProgress(n).level), [1, 1, 2, 2, 3, 4])
  assert.deepEqual(levelProgress(125), { level: 2, earned: 25, required: 150, percent: 16 })
  assert.equal(levelProgress(Infinity).level, 1)
})

test('parent completion credits leaves once and category bonus needs new genuine work', async t => {
  const db = await fixture(t)
  const repo = createTaskRepository(db)
  const categoryId = await repo.saveCategory({ name: 'Build' })
  const root = await repo.saveTask({ categoryId, title: 'Root' })
  const left = await repo.saveTask({ categoryId, parentId: root, title: 'Left' })
  const right = await repo.saveTask({ categoryId, parentId: root, title: 'Right' })
  await repo.toggle(root)
  assert.equal(await db.xpEvents.get('task:' + root), undefined)
  assert.deepEqual((await db.xpEvents.toArray()).map(e => e.amount).sort(), [20, 20, 50])
  await repo.toggle(root)
  await repo.toggle(root)
  assert.equal(await db.xpEvents.count(), 3)
  const third = await repo.saveTask({ categoryId, parentId: root, title: 'Third' })
  await repo.toggle(left)
  await repo.toggle(third)
  assert.equal(await db.xpEvents.count(), 4)
  await repo.toggle(left)
  assert.equal(await db.xpEvents.count(), 5)
  await repo.toggle(right)
  await repo.toggle(right)
  assert.equal(await db.xpEvents.count(), 5)
  assert.ok((await db.achievements.get('first')).unlockedAt > 0)
  const removed = await repo.deleteTask(root)
  await repo.restore(removed)
  assert.equal(await db.xpEvents.count(), 5)
})

test('focus XP uses active minutes, caps at 120 and excludes cancelled or short sessions', async t => {
  const db = await fixture(t)
  const repo = createFocusRepository(db)
  const start = new Date(2026, 5, 3, 9).getTime()
  const session = (id, mins) => ({ type: 'start', id, label: id, durationMs: mins * 60_000 })
  await repo.apply(session('long', 150), start)
  await repo.apply({ type: 'pause' }, start + 55 * 60_000)
  await repo.apply({ type: 'resume' }, start + 100 * 60_000)
  await Promise.all([1, 2, 3].map(() => repo.apply({ type: 'reconcile' }, start + 200 * 60_000)))
  assert.equal((await db.xpEvents.get('focus:long')).amount, 120)
  await repo.apply(session('short', 2), start + 201 * 60_000)
  await repo.apply({ type: 'finish' }, start + 201 * 60_000 + 40_000)
  await repo.apply(session('cancel', 25), start + 202 * 60_000)
  await repo.apply({ type: 'cancel' }, start + 217 * 60_000)
  await repo.apply(session('early', 25), start + 218 * 60_000)
  await repo.apply({ type: 'finish' }, start + 220 * 60_000 + 45_000)
  assert.equal((await db.xpEvents.get('focus:early')).amount, 2)
  assert.equal(await db.xpEvents.count(), 2)
  assert.deepEqual((await db.achievements.toArray()).map(e => e.id).sort(), ['deep', 'focus'])
})

test('daily quests roll over at local midnight and streaks tolerate yesterday', () => {
  const now = new Date(2026, 0, 2).getTime()
  const prev = localDay(now - 1)
  const current = localDay(now)
  const events = [1, 2, 3].map(n => ({ id: String(n), source: 'task', amount: 20, day: prev }))
  events.push({ id: 'focus', source: 'focus', amount: 45, focusMs: 45 * 60_000, day: prev })
  assert.deepEqual(dailyQuests(activity(events, prev)).map(q => q.current), [3, 1, 45])
  assert.deepEqual(dailyQuests(activity(events, current)).map(q => q.current), [0, 0, 0])
  assert.deepEqual(streaks(['2025-12-30', prev, prev, '2025-12-31'], current),
    { current: 3, longest: 3, recent: [prev, '2025-12-31', '2025-12-30'] })
  assert.equal(streaks(['2025-12-30', prev, '2025-12-31'], '2026-01-03').current, 0)
})

test('v4 upgrade backfills confirmed history once without inventing task dates', async t => {
  const name = crypto.randomUUID()
  const legacy = new Dexie(name)
  legacy.version(4).stores({
    categories: 'id, sortOrder', tasks: 'id, categoryId, parentId, sortOrder, dueDate',
    focusSessions: 'id, startedAt, taskId, endedAt', reminders: 'id, scheduledAt, [channel+scheduledAt], deliveredAt',
    timerState: 'id',
  })
  const base = { createdAt: 1, updatedAt: 2, sortOrder: 0 }
  await legacy.categories.add({ ...base, id: 'c', name: 'History' })
  await legacy.tasks.bulkAdd([
    { ...base, id: 'parent', categoryId: 'c', title: 'Parent', completed: true },
    { ...base, id: 'leaf', parentId: 'parent', categoryId: 'c', title: 'Leaf', completed: true },
  ])
  await legacy.focusSessions.bulkAdd([
    { ...base, id: 'verified', status: 'completed', startedAt: 1, endedAt: 120001, elapsedMs: 120000 },
    { ...base, id: 'unknown', startedAt: 1, endedAt: 120001 },
  ])
  legacy.close()
  const db = new StandbyDatabase(name)
  t.after(() => db.delete())
  await db.open()
  assert.equal(await db.xpEvents.count(), 2)
  assert.equal((await db.xpEvents.get('task:leaf')).timestamp, null)
  assert.equal((await db.xpEvents.get('focus:verified')).amount, 2)
  const unlocked = await db.achievements.toArray()
  await db.transaction('rw', db.xpEvents, db.achievements, db.tasks, db.categories, db.focusSessions, async () => {
    await reconcileHistory(db, buildTaskTree(await db.categories.toArray(), await db.tasks.toArray()),
      await db.focusSessions.toArray(), Date.now())
  })
  db.close()
  await db.open()
  assert.equal(await db.xpEvents.count(), 2)
  assert.deepEqual(await db.achievements.toArray(), unlocked)
  assert.equal(await db.tasks.count(), 2)
  assert.equal(await db.focusSessions.count(), 2)
})

test('three dated activity days and task thresholds unlock achievements once', async t => {
  const db = await fixture(t)
  const now = new Date(2026, 5, 3, 12).getTime()
  const dates = [1, 2, 3].map(day => new Date(2026, 5, day, 11).getTime())
  const sessions = dates.map((time, id) => ({ id: String(id), status: 'completed',
    startedAt: time - 60000, endedAt: time, elapsedMs: 60000 }))
  const tasks = Array.from({ length: 25 }, (_, i) => ({
    id: 't' + i, categoryId: 'c', title: 'Task', sortOrder: i, completed: true,
  }))
  await db.transaction('rw', db.xpEvents, db.achievements, () => reconcileHistory(db, buildTaskTree([], tasks), sessions, now))
  assert.deepEqual((await db.achievements.toCollection().primaryKeys()).sort(),
    ['consistent', 'dedicated', 'first', 'focus', 'keeper'])
})
