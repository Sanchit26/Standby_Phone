import Dexie, { type Table } from 'dexie'
import type { FocusSession, Reminder, Task, TaskCategory, CalendarEvent, MediaItem, Delivery } from '../types/models.ts'
import { buildTaskTree, repairTaskLinks } from './taskTree.ts'

import type { StoredTimer } from './focusRepository.ts'


export class StandbyDatabase extends Dexie {
  categories!: Table<TaskCategory, string>
  tasks!: Table<Task, string>
  focusSessions!: Table<FocusSession, string>
  timerState!: Table<StoredTimer, string>
  xpEvents!: Table<{ id: string }, string>
  achievements!: Table<{ id: string }, string>
  reminders!: Table<Reminder, string>

  events!: Table<CalendarEvent, string>
  media!: Table<MediaItem, string>
  mediaBlobs!: Table<{ id: string; blob: Blob }, string>
  librarySettings!: Table<{ id: string; value: string }, string>
  deliveries!: Table<Delivery, string>

  constructor(name = 'standby') {
    super(name)
    this.version(1).stores({
      categories: 'id, sortOrder',
      tasks: 'id, categoryId, parentId, completed, sortOrder',
      focusSessions: 'id, startedAt, taskId',
      reminders: 'id, scheduledAt, enabled',
    })
    // IndexedDB cannot index boolean values. Preserve them as record fields.
    this.version(2).stores({
      tasks: 'id, categoryId, parentId, sortOrder',
      reminders: 'id, scheduledAt, [channel+scheduledAt], deliveredAt',
    }).upgrade(async tx => {
      const now = Date.now()
      for (const name of ['categories', 'tasks', 'focusSessions', 'reminders']) {
        await tx.table(name).toCollection().modify(record => {
          record.createdAt ??= record.startedAt ?? now
          record.updatedAt ??= record.endedAt ?? record.createdAt
          if (name === 'reminders') record.channel ??= 'in-app'
        })
      }
    })
    this.version(3).stores({
      tasks: 'id, categoryId, parentId, sortOrder, dueDate',
    }).upgrade(async tx => {
      const categories = tx.table<TaskCategory, string>('categories')
      const tasks = tx.table<Task, string>('tasks')
      const groups = await categories.toArray()
      const known = new Set(groups.map(group => group.id))
      const rows = await tasks.toArray()
      const now = Date.now()
      const stranded = rows.filter(task => !known.has(task.categoryId))
      if (stranded.length) {
        let id = 'recovered'
        while (known.has(id)) id += '-tasks'
        const sortOrder = groups.reduce((last, group) => Math.max(last, group.sortOrder), -1) + 1
        const recovered = { id, name: 'Recovered tasks', sortOrder, createdAt: now, updatedAt: now }
        await categories.add(recovered)
        groups.push(recovered)
        for (const task of stranded) {
          task.categoryId = id
          task.updatedAt = now
        }
        await tasks.bulkPut(stranded)
      }
      const changes = repairTaskLinks(buildTaskTree(groups, rows))
      if (changes.length) await tasks.bulkPut(changes.map(task => ({ ...task, updatedAt: now })))
    })
    this.version(4).stores({
      timerState: 'id',
      focusSessions: 'id, startedAt, taskId, endedAt',
    })
    this.version(5).stores({
      xpEvents: 'id, timestamp, [source+categoryId]',
      achievements: 'id, unlockedAt',
    })
    this.version(6).stores({
      events: 'id, day', media: 'id, sortOrder', mediaBlobs: 'id', librarySettings: 'id',
      deliveries: 'id, scheduledAt, reminderId',
    })
    this.version(7).stores({}).upgrade(async tx => {
      const reminders = tx.table<Reminder, string>('reminders')
      const deliveries = tx.table<Delivery, string>('deliveries')
      const legacy = await reminders.filter(row => row.channel === 'in-app' && !row.schedule &&
        row.deliveredAt !== undefined && Number.isFinite(row.scheduledAt)).toArray()
      for (const row of legacy) {
        const id = row.id + ':' + row.scheduledAt
        if (!await deliveries.get(id)) await deliveries.add({ id, reminderId: row.id, scheduledAt: row.scheduledAt,
          triggeredAt: row.deliveredAt, message: row.message || row.title, status: 'unconfirmed' })
        await reminders.update(row.id, { enabled: false })
      }
    })
  }
}
export const db = new StandbyDatabase()
