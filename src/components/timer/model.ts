export const minute = 60_000
export const maxDuration = 12 * 60 * minute
export const presets = [15, 25, 45, 60, 90] as const

export type TimerMode = 'countdown' | 'stopwatch'
interface Session {
  mode?: 'countdown'
  id: string
  label: string
  plannedMs: number
  startedAt: number
  taskId?: string
  legacy?: boolean
}
type Watch = {
  mode: 'stopwatch'; id: string; label: string; startedAt: number; taskId?: string
  plannedMs?: undefined; legacy?: false; elapsedMs: number
} & ({ status: 'running'; resumedAt: number } | { status: 'paused' } | { status: 'completed' | 'cancelled'; endedAt: number })
export type Timer = { status: 'idle'; mode?: TimerMode } | Watch
  | (Session & { status: 'running'; deadline: number; budgetMs: number })
  | (Session & { status: 'paused'; remainingMs: number })
  | (Session & { status: 'completed' | 'cancelled'; endedAt: number; elapsedMs: number })

export type TimerAction =
  | { type: 'start'; id: string; label: string; durationMs: number; taskId?: string }
  | { type: 'switch'; mode: TimerMode; confirmedId?: string }
  | { type: 'set-duration'; durationMs: number }
  | { type: 'pause' | 'resume' | 'reset' | 'cancel' | 'finish' | 'reconcile' }

export function validDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minute && value <= maxDuration
}

export function remaining(timer: Timer, now = Date.now()) {
  if (timer.mode === 'stopwatch') return 0
  if (timer.status === 'paused') return timer.remainingMs
  return timer.status === 'running' ? Math.min(timer.budgetMs, Math.max(0, timer.deadline - now)) : 0
}

export function elapsed(timer: Timer, now = Date.now()) {
  if (timer.status === 'idle') return 0
  if (timer.status === 'completed' || timer.status === 'cancelled') return timer.elapsedMs
  if (timer.mode === 'stopwatch') return timer.elapsedMs + (timer.status === 'running' ? Math.max(0, now - timer.resumedAt) : 0)
  return timer.plannedMs - remaining(timer, now)
}

export function advance(timer: Timer, action: TimerAction, now = Date.now()): Timer {
  if (timer.mode === 'stopwatch') {
    if (timer.status === 'running' || timer.status === 'paused') {
      const session = { mode: 'stopwatch' as const, id: timer.id, taskId: timer.taskId, label: timer.label,
        startedAt: timer.startedAt, elapsedMs: elapsed(timer, now) }
      if (action.type === 'pause' && timer.status === 'running') return { ...session, status: 'paused' }
      if (action.type === 'resume' && timer.status === 'paused') return { ...session, status: 'running', resumedAt: now }
      if (['reset', 'finish', 'cancel'].includes(action.type)) return { ...session,
        status: action.type === 'finish' ? 'completed' : 'cancelled', endedAt: Math.max(now, timer.startedAt) }
    } else if (action.type === 'start') return { mode: 'stopwatch', id: action.id, label: action.label.trim() || 'Stopwatch',
      taskId: action.taskId, status: 'running', startedAt: now, resumedAt: now, elapsedMs: 0 }
    return timer
  }
  if (timer.status === 'running' && remaining(timer, now) === 0) {
    const { deadline, budgetMs: _budget, ...session } = timer
    return { ...session, status: 'completed', endedAt: Math.max(timer.startedAt, deadline), elapsedMs: timer.plannedMs }
  }
  if (timer.status === 'running' || timer.status === 'paused') {
    const { id, label, plannedMs, startedAt, taskId, legacy } = timer
    const session = { id, label, plannedMs, startedAt, taskId, legacy }
    if (action.type === 'cancel' || action.type === 'finish' || action.type === 'reset') return {
      ...session, status: action.type === 'finish' ? 'completed' : 'cancelled',
      elapsedMs: elapsed(timer, now), endedAt: Math.max(startedAt, now),
    }
    if (timer.status === 'running' && action.type === 'pause') {
      return { ...session, status: 'paused', remainingMs: remaining(timer, now) }
    }
    if (timer.status === 'paused' && action.type === 'resume') {
      return { ...session, status: 'running', deadline: now + timer.remainingMs, budgetMs: timer.remainingMs }
    }
    return timer
  }
  if (action.type === 'start' && validDuration(action.durationMs)) return {
    id: action.id, label: action.label.trim().slice(0, 80) || 'Focus session', taskId: action.taskId,
    status: 'running', startedAt: now, plannedMs: action.durationMs, budgetMs: action.durationMs,
    deadline: now + action.durationMs,
  }
  return action.type === 'reset' ? { status: 'idle' } : timer
}

const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max

export function restoreTimer(raw: unknown, now = Date.now(), importLegacy = false): Timer {
  const idle = { status: 'idle' } as const
  if (!raw || typeof raw !== 'object') return idle
  const { status, label, id, taskId, plannedMs, startedAt, deadline, budgetMs, remainingMs, endedAt, elapsedMs, legacy } =
    raw as Record<string, unknown>
  if ('mode' in raw && raw.mode === 'stopwatch') {
    const watchIdle = { mode: 'stopwatch', status: 'idle' } as const
    if (typeof id !== 'string' || typeof label !== 'string' || !integer(startedAt, 0) || !integer(elapsedMs, 0)) return watchIdle
    const session = { mode: 'stopwatch' as const, id, label, startedAt, elapsedMs, taskId: typeof taskId === 'string' ? taskId : undefined }
    if (status === 'running' && 'resumedAt' in raw && integer(raw.resumedAt, 0)) return { ...session, status, resumedAt: raw.resumedAt }
    if (status === 'paused') return { ...session, status }
    if ((status === 'completed' || status === 'cancelled') && integer(endedAt, startedAt)) return { ...session, status, endedAt }
    return watchIdle
  }
  if (typeof label !== 'string') return idle
  if (typeof id === 'string' && id && integer(plannedMs, 1, maxDuration) && integer(startedAt, 0) &&
      (plannedMs >= minute || legacy === true)) {
    const session = { id, label, plannedMs, startedAt, taskId: typeof taskId === 'string' ? taskId : undefined, legacy: legacy === true }
    if (status === 'running' && integer(deadline, 0) && integer(budgetMs, 1, plannedMs)) {
      return { ...session, status, deadline, budgetMs }
    }
    if (status === 'paused' && integer(remainingMs, 1, plannedMs)) return { ...session, status, remainingMs }
    if ((status === 'completed' || status === 'cancelled') && integer(endedAt, startedAt) && integer(elapsedMs, 0, plannedMs)) {
      return { ...session, status, endedAt, elapsedMs }
    }
  }
  if (!importLegacy || id !== undefined) return idle
  const pending = status === 'paused' && integer(remainingMs, 1, maxDuration) ? remainingMs
    : status === 'running' && integer(deadline, 0) && deadline <= now + maxDuration ? Math.max(0, deadline - now) : 0
  const session = { id: 'legacy-timer', label, plannedMs: pending || 1, startedAt: now, legacy: true }
  if (status === 'paused' && pending) return { ...session, status, remainingMs: pending }
  if (status === 'running' && pending) return { ...session, status, deadline: now + pending, budgetMs: pending }
  if ((status === 'completed' || status === 'running') && integer(deadline, 0, now)) return {
    ...session, status: 'completed', startedAt: deadline, endedAt: deadline, elapsedMs: 0,
  }
  return idle
}
