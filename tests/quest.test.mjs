import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import test from 'node:test'
import assert from 'node:assert/strict'
import { StandbyDatabase } from '../src/storage/database.ts'
import { createTaskRepository } from '../src/storage/taskRepository.ts'
import { createFocusRepository } from '../src/storage/focusRepository.ts'
import { buildTaskTree } from '../src/storage/taskTree.ts'

test('task and focus completion preserve category counts, session IDs and historical ledger records', async t => {
  const db = new StandbyDatabase(crypto.randomUUID())
  t.after(() => db.delete())
  const tasks = createTaskRepository(db)
  const focus = createFocusRepository(db)
  const xp = { id: 'old-xp', amount: 20, timestamp: 25 }
  const unlock = { id: 'old-unlock', unlockedAt: 25 }
  await db.xpEvents.add(xp)
  await db.achievements.add(unlock)
  const categoryId = await tasks.saveCategory({ name: 'Reading' })
  const parentId = await tasks.saveTask({ categoryId, title: 'Chapter' })
  const leaf = await tasks.saveTask({ categoryId, parentId, title: 'Summary' })
  await tasks.toggle(parentId)
  const tree = buildTaskTree(await db.categories.toArray(), await db.tasks.toArray())
  assert.equal(tree.categories[0].progress.done, 1)
  assert.equal(tree.categories[0].progress.total, 1)
  assert.equal(tree.byId.get(leaf).completed, true)
  await focus.apply({ type: 'start', id: 'session', label: 'Read', durationMs: 60_000, taskId: leaf }, 1000)
  await focus.apply({ type: 'reconcile' }, 61_000)
  const session = await db.focusSessions.get('session')
  assert.equal(session.taskId, leaf)
  assert.equal(session.elapsedMs, 60_000)
  assert.equal(session.status, 'completed')
  assert.deepEqual(await db.xpEvents.toArray(), [xp])
  assert.deepEqual(await db.achievements.toArray(), [unlock])
})

test('upgrading a pre-ledger database preserves completed tasks and sessions without fabricating awards', async t => {
  const name = crypto.randomUUID()
  const legacy = new Dexie(name)
  legacy.version(4).stores({
    categories: 'id, sortOrder', tasks: 'id, categoryId, parentId, sortOrder, dueDate',
    focusSessions: 'id, startedAt, taskId, endedAt', reminders: 'id, scheduledAt, [channel+scheduledAt], deliveredAt',
    timerState: 'id',
  })
  const base = { createdAt: 1, updatedAt: 2, sortOrder: 0 }
  await legacy.categories.add({ ...base, id: 'c', name: 'History' })
  await legacy.tasks.add({ ...base, id: 'leaf', categoryId: 'c', title: 'Leaf', completed: true })
  await legacy.focusSessions.add({ ...base, id: 'sample', status: 'completed', startedAt: 1, endedAt: 120001, elapsedMs: 120000 })
  legacy.close()
  const db = new StandbyDatabase(name)
  t.after(() => db.delete())
  assert.equal((await db.tasks.get('leaf')).completed, true)
  assert.equal((await db.focusSessions.get('sample')).elapsedMs, 120000)
  assert.equal(await db.xpEvents.count(), 0)
  assert.equal(await db.achievements.count(), 0)
})
