import { liveQuery } from 'dexie'
import { db } from './database'
import { buildTaskTree } from './taskTree'
import { completedToday } from './focusRepository'

export function observeQuestHub(dayStart: number) {
  return liveQuery(() => db.transaction('r', db.tasks, db.categories, db.xpEvents, db.achievements, db.focusSessions, async () => {
    const [groups, tasks, xp, recent, unlocked, sessions] = await Promise.all([
      db.categories.toArray(), db.tasks.toArray(), db.xpEvents.toArray(),
      db.xpEvents.orderBy('timestamp').reverse().limit(10).toArray(), db.achievements.toArray(),
      db.focusSessions.where('endedAt').aboveOrEqual(dayStart).toArray(),
    ])
    return { tree: buildTaskTree(groups, tasks), xp, recent, unlocked, focus: completedToday(sessions, dayStart) }
  }))
}
