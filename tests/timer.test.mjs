import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { advance, elapsed, remaining, restoreTimer } from '../src/components/timer/model.ts'
import { StandbyDatabase } from '../src/storage/database.ts'
import { completedToday, createFocusRepository } from '../src/storage/focusRepository.ts'

const initial = { status: 'idle' }
const action = (id = 'one', taskId) => ({ type: 'start', id, label: 'Read', durationMs: 60_000, taskId })

test('pause and resume preserve the deadline budget and exclude pauses', () => {
  const running = advance(initial, action(), 1000)
  assert.equal(running.status, 'running')
  assert.equal(remaining(running, 12500), 48500)
  assert.equal(remaining(running, 0), 60000)
  const paused = advance(running, { type: 'pause' }, 12500)
  assert.equal(remaining(restoreTimer(paused, 100000)), 48500)
  const resumed = advance(paused, { type: 'resume' }, 100000)
  assert.equal(remaining(resumed, 120000), 28500)
  const completed = advance(restoreTimer(resumed, 900000), { type: 'reconcile' }, 900000)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.endedAt, 148500)
  assert.equal(elapsed(completed), 60000)
  assert.equal(remaining(completed, 900000), 0)
  assert.deepEqual(advance(completed, { type: 'reset' }), initial)
})

test('invalid durations and invalid persisted state fall back safely', () => {
  for (const durationMs of [0, -1, 100, Infinity, NaN, 43_200_001, '60000']) {
    assert.deepEqual(advance(initial, { ...action(), durationMs }, 1000), initial)
  }
  for (const raw of [null, {}, { status: 'paused', label: '', remainingMs: -1 },
    { ...advance(initial, action(), 1000), budgetMs: 60001 }]) {
    assert.deepEqual(restoreTimer(raw), initial)
  }
})

test('refresh recovery and concurrent expiry persist one completion', async t => {
  const db = new StandbyDatabase('focus-expiry')
  t.after(() => db.delete())
  const repo = createFocusRepository(db)
  await repo.apply(action(), 1000)
  db.close()
  await db.open()
  assert.equal((await repo.load(null, 2000)).timer.deadline, 61000)
  const results = await Promise.all(Array.from({ length: 4 }, () => repo.apply({ type: 'reconcile' }, 90000)))
  assert.equal(results.filter(item => item.finishedLabel).length, 1)
  assert.equal(await db.focusSessions.count(), 1)
  assert.equal((await db.focusSessions.get('one')).endedAt, 61000)
  assert.equal((await repo.load(null, 95000)).timer.status, 'completed')
})

test('reset and cancellation record partial focus, finish records completion, and deleted tasks are safe', async t => {
  const db = new StandbyDatabase('focus-controls')
  t.after(() => db.delete())
  const repo = createFocusRepository(db)
  await db.tasks.add({ id: 'task', title: 'Task', categoryId: 'c', completed: false, sortOrder: 0, createdAt: 0, updatedAt: 0 })
  await repo.apply(action('first', 'task'), 1000)
  await repo.apply({ type: 'pause' }, 11000)
  await db.tasks.delete('task')
  assert.equal((await repo.apply({ type: 'reset' }, 20000)).timer.status, 'idle')
  const first = await db.focusSessions.get('first')
  assert.equal(first.elapsedMs, 10000)
  assert.equal(first.status, 'cancelled')
  assert.equal(first.taskId, 'task')
  await repo.apply(action('second', 'task'), 25000)
  await repo.apply({ type: 'cancel' }, 30000)
  assert.equal((await db.focusSessions.get('second')).taskId, undefined)
  assert.equal((await db.focusSessions.get('second')).status, 'cancelled')
  await repo.apply(action('third'), 31000)
  await repo.apply({ type: 'finish' }, 41000)
  assert.equal((await db.focusSessions.get('third')).elapsedMs, 10000)
  assert.equal((await db.focusSessions.get('third')).status, 'completed')
  await repo.apply({ type: 'set-duration', durationMs: 900000 }, 42000)
  assert.equal((await repo.load(null, 43000)).lastDuration, 900000)
})

test('legacy running and paused timers recover without fabricating history', async t => {
  const db = new StandbyDatabase('focus-legacy')
  t.after(() => db.delete())
  const repo = createFocusRepository(db)
  assert.equal(restoreTimer({ status: 'running', deadline: 10000, label: 'Old' }, 1000, true).deadline, 10000)
  await repo.load({ status: 'paused', remainingMs: 5000, label: 'Old' }, 1000)
  await repo.apply({ type: 'resume' }, 2000)
  assert.equal((await repo.load(null, 50000)).timer.status, 'completed')
  assert.equal(await db.focusSessions.count(), 0)
})

test('today is based on local completion timestamps and excludes cancelled records', () => {
  const midnight = new Date(2026, 10, 22).getTime()
  const tomorrow = new Date(2026, 10, 23).getTime()
  const sessions = [
    { endedAt: midnight - 1, startedAt: midnight - 1000, elapsedMs: 999, status: 'completed' },
    { endedAt: midnight, startedAt: midnight - 2000, elapsedMs: 1000, status: 'completed' },
    { endedAt: midnight + 1500, startedAt: midnight + 500 },
    { endedAt: midnight + 2000, startedAt: midnight, status: 'cancelled' },
    { endedAt: tomorrow, startedAt: tomorrow - 1000, status: 'completed' },
  ]
  assert.deepEqual(completedToday(sessions, midnight + 10), { count: 2, duration: 2000 })
})
