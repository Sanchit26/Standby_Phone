import { liveQuery } from 'dexie'
import { db } from './database'
import { completedToday } from './focusRepository'

export function observeFocusHistory(dayStart: number) {
  return liveQuery(() => db.transaction('r', db.focusSessions, db.tasks, async () => {
    const recent = await db.focusSessions.orderBy('endedAt').reverse().limit(12).toArray()
    const today = await db.focusSessions.where('endedAt').aboveOrEqual(dayStart).toArray()
    const tasks = await db.tasks.bulkGet(recent.map(item => item.taskId ?? ''))
    return { today: completedToday(today, dayStart), recent: recent.map((session, i) => ({
      ...session, taskTitle: tasks[i]?.title,
    })) }
  }))
}

export function observeFocusTasks() {
  return liveQuery(() => db.transaction('r', db.tasks, db.categories, async () => {
    const categories = new Map((await db.categories.toArray()).map(group => [group.id, group.name]))
    return (await db.tasks.toArray()).sort((a, b) => a.title.localeCompare(b.title)).map(task => ({
      id: task.id, name: task.title, category: categories.get(task.categoryId) ?? 'Tasks',
    }))
  }))
}
