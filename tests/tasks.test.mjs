import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import test from 'node:test'
import assert from 'node:assert/strict'
import { StandbyDatabase } from '../src/storage/database.ts'
import { createTaskRepository } from '../src/storage/taskRepository.ts'
import { buildTaskTree, repairTaskLinks } from '../src/storage/taskTree.ts'

const group = (id, sortOrder = 0) => ({ id, name: id, sortOrder, createdAt: 1, updatedAt: 1 })
const row = (id, categoryId, parentId, completed = false) => ({
  id, categoryId, parentId, completed, title: id, sortOrder: 0, createdAt: 1, updatedAt: 1,
})
const fixture = async t => {
  const db = new StandbyDatabase(`test-${crypto.randomUUID()}`)
  t.after(() => db.delete())
  await db.open()
  return { db, repo: createTaskRepository(db) }
}

test('progress counts leaves across nested parents, categories and the whole database', () => {
  const tree = buildTaskTree([group('a'), group('b'), group('empty')], [
    row('root', 'a', undefined, true), row('branch', 'a', 'root'),
    row('one', 'a', 'branch', true), row('two', 'a', 'branch'), row('three', 'a', 'root', true),
    row('four', 'b', undefined, true), row('five', 'b'),
  ])
  assert.deepEqual(tree.perTask.get('root'), { total: 3, done: 2, pending: 1, percent: 67 })
  assert.deepEqual(tree.perTask.get('branch'), { total: 2, done: 1, pending: 1, percent: 50 })
  assert.deepEqual(tree.overall, { total: 5, done: 3, pending: 2, percent: 60 })
  assert.deepEqual(tree.categories.map(({ id, progress }) => [id, progress.percent]), [
    ['a', 67], ['b', 50], ['empty', 0],
  ])
  assert.equal(repairTaskLinks(tree).find(task => task.id === 'root').completed, false)
})

test('broken links and cycles become roots without losing any tasks', () => {
  const tree = buildTaskTree([group('a'), group('b')], [
    row('a1', 'a', 'a2'), row('a2', 'a', 'a1'),
    row('b1', 'b', 'a1'), row('a3', 'a', 'missing'), row('a4', 'a', 'a4'),
  ])
  assert.equal(tree.parents.size, 1)
  assert.equal(tree.byId.size, 5)
  assert.equal(tree.overall.total, 4)
})

test('deep hierarchies do not require a recursive call stack', () => {
  const rows = Array.from({ length: 12_000 }, (_, i) => row(String(i), 'a', i ? String(i - 1) : undefined, true))
  const tree = buildTaskTree([group('a')], rows)
  assert.deepEqual(tree.overall, { total: 1, done: 1, pending: 0, percent: 100 })
})

test('repository toggles descendants and derives ancestors under rapid writes', async t => {
  const { db, repo } = await fixture(t)
  const categoryId = await repo.saveCategory({ name: 'Build' })
  const root = await repo.saveTask({ categoryId, title: 'Root' })
  const branch = await repo.saveTask({ categoryId, parentId: root, title: 'Branch' })
  const leaf = await repo.saveTask({ categoryId, parentId: branch, title: 'Leaf' })
  const sibling = await repo.saveTask({ categoryId, parentId: root, title: 'Sibling' })
  await repo.toggle(leaf)
  assert.deepEqual(await Promise.all([root, branch, leaf].map(async id => (await db.tasks.get(id)).completed)), [false, true, true])
  await repo.toggle(sibling)
  assert.equal((await db.tasks.get(root)).completed, true)
  await repo.toggle(root)
  assert.ok((await db.tasks.toArray()).every(task => !task.completed))
  await Promise.all([repo.toggle(root), repo.toggle(root), repo.toggle(root)])
  assert.ok((await db.tasks.toArray()).every(task => task.completed))
})

test('moving a nested branch preserves children and rejects circular or cross-category parents', async t => {
  const { db, repo } = await fixture(t)
  const a = await repo.saveCategory({ name: 'A' })
  const b = await repo.saveCategory({ name: 'B', color: 'amber' })
  const root = await repo.saveTask({ categoryId: a, title: 'Root' })
  const child = await repo.saveTask({ categoryId: a, parentId: root, title: 'Child' })
  const leaf = await repo.saveTask({ categoryId: a, parentId: child, title: 'Leaf' })
  const destination = await repo.saveTask({ categoryId: b, title: 'Destination' })
  await assert.rejects(repo.saveTask({ categoryId: a, parentId: leaf, title: 'Root' }, root), /outside/)
  await assert.rejects(repo.saveTask({ categoryId: b, parentId: root, title: 'Child' }, child), /outside/)
  await repo.saveTask({ categoryId: b, parentId: destination, title: 'Edited', description: 'Notes', dueDate: '2026-12-01' }, child)
  const moved = await db.tasks.get(child)
  assert.equal(moved.title, 'Edited')
  assert.equal(moved.parentId, destination)
  assert.equal(moved.dueDate, '2026-12-01')
  assert.equal((await db.tasks.get(leaf)).categoryId, b)
  assert.equal((await db.tasks.get(leaf)).parentId, child)
  assert.equal((await db.tasks.get(root)).categoryId, a)
  db.close()
  await db.open()
  assert.deepEqual(await db.tasks.get(child), moved)
})

test('category actions, sibling ordering, cascading deletion and undo are atomic', async t => {
  const { db, repo } = await fixture(t)
  const a = await repo.saveCategory({ name: 'A' })
  const b = await repo.saveCategory({ name: 'B' })
  const root = await repo.saveTask({ categoryId: a, title: 'Root' })
  const child = await repo.saveTask({ categoryId: a, parentId: root, title: 'Child' })
  const sibling = await repo.saveTask({ categoryId: a, parentId: root, title: 'Child' })
  await repo.reorderTask(sibling, -1)
  assert.equal((await db.tasks.get(sibling)).sortOrder, 0)
  await repo.reorderCategory(b, -1)
  assert.equal((await db.categories.get(b)).sortOrder, 0)
  await assert.rejects(repo.deleteCategory(a, { kind: 'empty' }), /has tasks/)
  assert.equal(await db.tasks.count(), 3)
  await repo.deleteCategory(a, { kind: 'move', to: b })
  assert.ok((await db.tasks.toArray()).every(task => task.categoryId === b))
  assert.equal((await db.tasks.get(child)).parentId, root)
  const removed = await repo.deleteTask(root)
  assert.equal(await db.tasks.count(), 0)
  await repo.restore(removed)
  assert.equal(await db.tasks.count(), 3)
  assert.equal((await db.tasks.get(sibling)).parentId, root)
  const removedCategory = await repo.deleteCategory(b, { kind: 'delete' })
  assert.equal(await db.categories.count(), 0)
  assert.equal(await db.tasks.count(), 0)
  await repo.restore(removedCategory)
  assert.equal(await db.tasks.count(), 3)
})

test('v1 records migrate in place through v7 with stable IDs and repaired hierarchy', async t => {
  const name = `legacy-${crypto.randomUUID()}`
  const legacy = new Dexie(name)
  legacy.version(1).stores({
    categories: 'id, sortOrder',
    tasks: 'id, categoryId, parentId, completed, sortOrder',
    focusSessions: 'id, startedAt, taskId',
    reminders: 'id, scheduledAt, enabled',
  })
  const db = new StandbyDatabase(name)
  t.after(() => db.delete())
  await legacy.categories.add({ id: 'keep', name: 'Saved', sortOrder: 0 })
  await legacy.tasks.bulkAdd([
    { id: 'parent', categoryId: 'keep', title: 'Parent', completed: true, sortOrder: 0 },
    { id: 'child', categoryId: 'keep', parentId: 'parent', title: 'Child', completed: false, sortOrder: 0 },
    { id: 'lost', categoryId: 'missing', parentId: 'bogus', title: 'Lost', completed: true, sortOrder: 0 },
  ])
  await legacy.focusSessions.add({ id: 'time', taskId: 'child', startedAt: 1, endedAt: 2 })
  await legacy.reminders.add({ id: 'reminder', title: 'Keep', scheduledAt: 1000, enabled: false })
  legacy.close()
  await db.open()
  assert.equal(db.verno, 7)
  assert.equal(await db.tasks.count(), 3)
  assert.equal((await db.tasks.get('child')).parentId, 'parent')
  assert.equal((await db.tasks.get('parent')).completed, false)
  const recovered = await db.tasks.get('lost')
  assert.equal(recovered.parentId, undefined)
  assert.equal((await db.categories.get(recovered.categoryId)).name, 'Recovered tasks')
  assert.equal((await db.focusSessions.get('time')).endedAt, 2)
  assert.equal((await db.reminders.get('reminder')).enabled, false)
  assert.ok((await db.tasks.get('child')).createdAt > 0)
})
