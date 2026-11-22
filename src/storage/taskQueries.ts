import { liveQuery } from 'dexie'
import { db } from './database'
import { buildTaskTree } from './taskTree'

export function readTasks() {
  return db.transaction('r', db.categories, db.tasks, async () =>
    buildTaskTree(await db.categories.toArray(), await db.tasks.toArray()))
}

export const observeTasks = () => liveQuery(readTasks)
