import type { StandbyDatabase } from './database.ts'
import { advance, restoreTimer, validDuration, type Timer, type TimerAction } from '../components/timer/model.ts'
import type { FocusSession } from '../types/models.ts'

export function completedToday(sessions: readonly FocusSession[], now: number) {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  const start = day.getTime()
  day.setDate(day.getDate() + 1)
  const end = day.getTime()
  let count = 0
  let duration = 0
  for (const session of sessions) {
    if (session.status === 'cancelled' || session.endedAt === undefined ||
        session.endedAt < start || session.endedAt >= end || session.endedAt < session.startedAt) continue
    count++
    duration += session.elapsedMs ?? session.endedAt - session.startedAt
  }
  return { count, duration }
}

export function createFocusRepository(db: StandbyDatabase) {
  async function apply(action: TimerAction, now = Date.now(), legacy?: unknown) {
    return db.transaction('rw', db.timerState, db.focusSessions, db.tasks, async () => {
      const row = await db.timerState.get('current')
      const current = row ? restoreTimer(row.timer, now) : restoreTimer(legacy, now, true)
      if (action.type === 'start' && action.taskId && !await db.tasks.get(action.taskId)) {
        action = { ...action, taskId: undefined }
      }
      if (action.type === 'switch' && (current.status === 'running' || current.status === 'paused') &&
          current.id !== action.confirmedId) throw new Error('Confirm the active session before switching.')
      let next = advance(current, action.type === 'switch' ? { type: 'cancel' } : action, now)
      let finishedLabel: string | undefined
      if ((next.status === 'completed' || next.status === 'cancelled') && !next.legacy &&
          !await db.focusSessions.get(next.id)) {
        const session: FocusSession = {
          id: next.id, mode: next.mode ?? 'countdown', label: next.label, status: next.status, plannedMs: next.plannedMs, elapsedMs: next.elapsedMs,
          startedAt: next.startedAt, endedAt: next.endedAt, taskId: next.taskId,
          createdAt: next.startedAt, updatedAt: next.endedAt,
        }
        await db.focusSessions.add(session)
        if (next.status === 'completed') {
          finishedLabel = next.label
        }
      }
      if (action.type === 'reset' || action.type === 'switch') next = { status: 'idle', mode: action.type === 'switch' ? action.mode : current.mode }
      const selected = action.type === 'set-duration' ? action.durationMs
        : action.type === 'start' && next.status === 'running' && next.id === action.id ? next.plannedMs : undefined
      const lastDuration = validDuration(selected) ? selected : validDuration(row?.lastDuration) ? row.lastDuration : 25 * 60_000
      if (next !== current || !row || lastDuration !== row.lastDuration ||
          (current.status === 'idle' && row.timer?.status !== 'idle')) {
        await db.timerState.put({ id: 'current', timer: next, lastDuration })
      }
      return { timer: next, finishedLabel }
    })
  }

  async function load(legacy: unknown, now = Date.now()) {
    await apply({ type: 'reconcile' }, now, legacy)
    return (await db.timerState.get('current'))!
  }

  return { apply, load }
}

export type StoredTimer = { id: 'current'; timer: Timer; lastDuration: number }
