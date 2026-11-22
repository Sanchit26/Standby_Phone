import type { Table } from 'dexie'
import type { FocusSession } from '../types/models.ts'
import type { TaskTree } from './taskTree.ts'
import {
  achievementIds, achievements, activity, focusAward, localDay, taskAward, xpRules, type XpEvent, type Achievement,
} from './questEngine.ts'

export interface Ledger {
  xpEvents: Table<XpEvent, string>
  achievements: Table<Achievement, string>
}

export async function unlockAchievements(ledger: Ledger, now: number) {
  const [events, unlocked] = await Promise.all([ledger.xpEvents.toArray(), ledger.achievements.toCollection().primaryKeys()])
  const stats = activity(events, localDay(now))
  const missing = achievementIds.filter(id => !unlocked.includes(id) &&
    achievements[id].progress(stats) >= achievements[id].target)
  if (missing.length) await ledger.achievements.bulkAdd(missing.map(id => ({ id, unlockedAt: now })))
}

export async function recordTaskCompletion(
  ledger: Ledger, before: TaskTree, after: TaskTree, categoryId: string, leaves: string[], now: number,
) {
  const existing = await ledger.xpEvents.bulkGet(leaves.map(id => 'task:' + id))
  const fresh = leaves.flatMap((id, i) => existing[i] ? [] : [taskAward(after.byId.get(id)!, now)])
  if (fresh.length) await ledger.xpEvents.bulkAdd(fresh)

  const previous = before.categories.find(category => category.id === categoryId)?.progress
  const group = after.categories.find(category => category.id === categoryId)
  let awardedCategory = false
  if (group && previous && previous.done < previous.total &&
      group.progress.total > 0 && group.progress.done === group.progress.total) {
    const credits = await ledger.xpEvents.where('[source+categoryId]').equals(['task', categoryId])
      .filter(event => event.day !== null).count()
    const bonuses = await ledger.xpEvents.where('[source+categoryId]').equals(['category', categoryId]).toArray()
    const priorCredits = bonuses.reduce((max, event) => Math.max(max, event.creditedLeaves ?? 0), 0)
    if (credits > priorCredits) {
      await ledger.xpEvents.add({
        id: 'category:' + categoryId + ':' + credits, source: 'category', sourceId: categoryId, categoryId,
        label: group.name, amount: xpRules.category, timestamp: now, day: localDay(now), creditedLeaves: credits,
      })
      awardedCategory = true
    }
  }
  if (fresh.length || awardedCategory) await unlockAchievements(ledger, now)
}

export async function recordFocusCompletion(ledger: Ledger, session: FocusSession, now: number) {
  const event = focusAward(session)
  if (!event || await ledger.xpEvents.get(event.id)) return
  await ledger.xpEvents.add(event)
  await unlockAchievements(ledger, now)
}

export async function reconcileHistory(ledger: Ledger, tree: TaskTree, sessions: FocusSession[], now: number) {
  const events: XpEvent[] = []
  for (const task of tree.byId.values()) {
    if (task.completed && !tree.children.has(task.id)) events.push(taskAward(task, null))
  }
  for (const session of sessions) {
    const event = focusAward(session)
    if (event) events.push(event)
  }
  const existing = await ledger.xpEvents.bulkGet(events.map(event => event.id))
  const missing = events.filter((_, index) => !existing[index])
  if (missing.length) await ledger.xpEvents.bulkAdd(missing)
  await unlockAchievements(ledger, now)
}
