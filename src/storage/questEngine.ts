import type { FocusSession, Task } from '../types/models.ts'

export interface XpEvent {
  id: string
  source: 'task' | 'focus' | 'category'
  sourceId: string
  amount: number
  label: string
  timestamp: number | null
  day: string | null
  categoryId?: string
  focusMs?: number
  creditedLeaves?: number
}

export const xpRules = { task: 20, category: 50, focusCap: 120 }
const minute = 60_000

export function localDay(time: number) {
  const d = new Date(time)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export function levelProgress(xp: number) {
  let level = 1
  let earned = Number.isSafeInteger(xp) && xp > 0 ? xp : 0
  let required = 100
  while (earned >= required) {
    earned -= required
    required += 50
    level++
  }
  return { level, earned, required, percent: Math.floor(earned * 100 / required) }
}

export function taskAward(task: Task, time: number | null): XpEvent {
  return { id: 'task:' + task.id, source: 'task', sourceId: task.id, label: task.title, amount: xpRules.task,
    timestamp: time, day: time === null ? null : localDay(time), categoryId: task.categoryId }
}

export function focusAward(session: FocusSession): XpEvent | undefined {
  const { endedAt, elapsedMs } = session
  if (session.status !== 'completed' || endedAt === undefined || !Number.isSafeInteger(endedAt) ||
      endedAt < session.startedAt || elapsedMs === undefined || !Number.isSafeInteger(elapsedMs) || elapsedMs < minute) return
  return { id: 'focus:' + session.id, source: 'focus', sourceId: session.id, label: session.label ?? 'Focus session',
    amount: Math.min(xpRules.focusCap, Math.floor(elapsedMs / minute)), timestamp: endedAt,
    day: localDay(endedAt), focusMs: elapsedMs }
}

const dayNumber = (day: string) => Date.parse(day + 'T00:00:00Z') / 86_400_000

export function streaks(days: Iterable<string>, today: string) {
  const todayNumber = dayNumber(today)
  const recent = [...new Set(days)].filter(day => dayNumber(day) <= todayNumber).sort()
  let longest = 0
  let run = 0
  let last = -Infinity
  for (const day of recent) {
    const current = dayNumber(day)
    run = current === last + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    last = current
  }
  return { current: last >= todayNumber - 1 ? run : 0, longest, recent: recent.slice(-7).reverse() }
}

export function activity(events: readonly XpEvent[], today: string) {
  let tasks = 0
  let sessions = 0
  let deepFocus = false
  let todayTasks = 0
  let todaySessions = 0
  let todayMs = 0
  let xp = 0
  const days = new Set<string>()
  for (const event of events) {
    xp += event.amount
    if (event.source === 'task') {
      tasks++
      if (event.day === today) todayTasks++
    } else if (event.source === 'focus') {
      sessions++
      deepFocus ||= (event.focusMs ?? 0) >= 60 * minute
      if (event.day === today) {
        todaySessions++
        todayMs += event.focusMs ?? 0
      }
    }
    if (event.day && event.source !== 'category') days.add(event.day)
  }
  return { tasks, sessions, deepFocus, xp, todayTasks, todaySessions, todayMs, streak: streaks(days, today) }
}

type Activity = ReturnType<typeof activity>
export const achievements = {
  first: { name: 'First Steps', hint: 'Complete an actionable task.', target: 1, progress: (a: Activity) => a.tasks },
  focus: { name: 'Focus Initiate', hint: 'Complete a qualifying focus session.', target: 1, progress: (a: Activity) => a.sessions },
  keeper: { name: 'Quest Keeper', hint: 'Complete 10 actionable tasks.', target: 10, progress: (a: Activity) => a.tasks },
  deep: { name: 'Deep Focus', hint: 'Complete a session with 60 minutes of active focus.', target: 1, progress: (a: Activity) => +a.deepFocus },
  consistent: { name: 'Consistent Adventurer', hint: 'Log activity on three consecutive local days.', target: 3, progress: (a: Activity) => a.streak.longest },
  dedicated: { name: 'Dedicated Adventurer', hint: 'Complete 25 actionable tasks.', target: 25, progress: (a: Activity) => a.tasks },
}
export type AchievementId = keyof typeof achievements
export type Achievement = { id: AchievementId; unlockedAt: number }
export const achievementIds = Object.keys(achievements) as AchievementId[]

export function dailyQuests(data: Activity) {
  return [
    { id: 'tasks', label: 'Complete 3 actionable tasks', current: data.todayTasks, target: 3 },
    { id: 'focus', label: 'Complete a qualifying focus session', current: data.todaySessions, target: 1 },
    { id: 'minutes', label: 'Log 45 minutes of completed focus', current: Math.floor(data.todayMs / minute), target: 45 },
  ]
}
