import type { StandbyDatabase } from '../storage/database.ts'
import { localDate } from '../storage/calendar.ts'
import { newEntity } from '../storage/entity.ts'
import type { Delivery, Reminder, ReminderSchedule } from '../types/models.ts'

export const graceMs = 60_000
export const minInterval = 5
const maxInterval = 525_600
const queueLimit = 4
const clockTime = /^([01]\d|2[0-3]):[0-5]\d$/

export function dailyOccurrence(time: string, after: number, lastDay?: string) {
  if (!clockTime.test(time)) throw new Error('Choose a valid local time.')
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date(after)
  const last = lastDay && /^\d{4}-\d{2}-\d{2}$/.test(lastDay) ? new Date(lastDay + 'T12:00:00') : undefined
  // Move from the previous delivered local date when the wall clock moves backward.
  if (last && Number.isFinite(+last) && localDate(date) <= localDate(last)) {
    date.setTime(+last)
    date.setDate(date.getDate() + 1)
  }
  date.setHours(hours, minutes, 0, 0)
  if (+date <= after) {
    date.setDate(date.getDate() + 1)
    date.setHours(hours, minutes, 0, 0)
  }
  return +date
}

export function intervalOccurrence(minutes: number, after: number, anchor = after) {
  if (!Number.isSafeInteger(minutes) || minutes < minInterval || minutes > maxInterval) {
    throw new Error('Choose a whole interval from 5 to 525,600 minutes.')
  }
  const interval = minutes * 60_000
  return anchor + Math.max(1, Math.floor((after - anchor) / interval) + 1) * interval
}

function firstOccurrence(schedule: ReminderSchedule, now: number, lastDay?: string) {
  if (schedule.kind === 'daily') return dailyOccurrence(schedule.time, now, lastDay)
  if (schedule.kind === 'interval') return intervalOccurrence(schedule.minutes, now)
  if (schedule.kind !== 'once' || !Number.isFinite(schedule.at) || schedule.at <= now) {
    throw new Error('Choose a future date and time.')
  }
  return schedule.at
}

function sameRecurrence(a: ReminderSchedule, b?: ReminderSchedule) {
  if (a.kind === 'daily') return b?.kind === 'daily' && a.time === b.time
  return a.kind === 'interval' && b?.kind === 'interval' && a.minutes === b.minutes
}

export type ReminderDraft = Pick<Reminder, 'message' | 'voice' | 'rate' | 'volume'> & { schedule: ReminderSchedule }
export type Claim = { reminder: Reminder; delivery: Delivery }
export type DeliveryResult = Pick<Delivery, 'status' | 'error'>

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const editable = (row: Reminder) => row.channel === 'in-app'
const pending = (row: Reminder) => editable(row) && row.enabled && Number.isFinite(row.scheduledAt) &&
  (row.schedule !== undefined || row.deliveredAt === undefined)

export function createReminderRepository(db: StandbyDatabase) {
  const list = () => db.reminders.filter(editable).sortBy('scheduledAt')
  const pendingRows = () => db.reminders.filter(pending).toArray()
  const history = () => db.deliveries.orderBy('scheduledAt').reverse().limit(30).toArray()

  async function save(draft: ReminderDraft, id?: string, now = Date.now()) {
    const message = draft.message?.trim()
    if (!message || message.length > 500) throw new Error('Enter a message of up to 500 characters.')
    const proposedAt = firstOccurrence(draft.schedule, now)
    const rate = draft.rate ?? 1
    const volume = draft.volume ?? 1
    if (!Number.isFinite(rate) || rate < .5 || rate > 2 || !Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new Error('Choose a valid speech rate and volume.')
    }
    return db.transaction('rw', db.reminders, async () => {
      const old = id ? await db.reminders.get(id) : undefined
      if (id && (!old || !editable(old))) throw new Error('This reminder was removed.')
      const keepNext = !!old && Number.isFinite(old.scheduledAt) && sameRecurrence(draft.schedule, old.schedule)
      const lastDay = draft.schedule.kind === 'daily' ? old?.lastDay : undefined
      const scheduledAt = keepNext ? old.scheduledAt : lastDay && draft.schedule.kind === 'daily'
        ? dailyOccurrence(draft.schedule.time, now, lastDay) : proposedAt
      return db.reminders.put({ ...(old ?? newEntity(now)), channel: 'in-app', enabled: old?.enabled ?? true,
        title: message, message, schedule: draft.schedule, scheduledAt, rate, volume, voice: draft.voice || undefined,
        timezone: keepNext ? old.timezone : timezone(), lastDay, deliveredAt: undefined, updatedAt: now })
    })
  }

  async function setEnabled(id: string, enabled: boolean, now = Date.now()) {
    await db.transaction('rw', db.reminders, async () => {
      const row = await db.reminders.get(id)
      if (!row || !editable(row)) throw new Error('This reminder was removed.')
      if (row.enabled === enabled) return
      const schedule = row.schedule ?? { kind: 'once', at: row.scheduledAt }
      const scheduledAt = enabled ? firstOccurrence(schedule, now, row.lastDay) : row.scheduledAt
      await db.reminders.update(id, { enabled, scheduledAt, timezone: timezone(), updatedAt: now })
    })
  }

  async function remove(id: string) {
    await db.reminders.where('id').equals(id).filter(editable).delete()
  }

  async function reconcile(now: number, zone = timezone()) {
    return db.transaction('rw', db.reminders, db.deliveries, async () => {
      const rows = await pendingRows()
      const claims: Claim[] = []
      for (const row of rows) {
        if (row.schedule?.kind !== 'daily' || !row.timezone || row.timezone === zone) continue
        try {
          row.scheduledAt = dailyOccurrence(row.schedule.time, now - graceMs - 1, row.lastDay)
          row.timezone = zone
          await db.reminders.put(row)
        } catch {
          // Let the due pass report the invalid schedule without retrying the rebase indefinitely.
          row.timezone = zone
          await db.reminders.update(row.id, { timezone: zone })
        }
      }
      rows.sort((a, b) => a.scheduledAt - b.scheduledAt || a.id.localeCompare(b.id))
      for (const row of rows) {
        if (row.scheduledAt > now) break
        const day = row.schedule?.kind === 'daily' ? localDate(new Date(row.scheduledAt)) : undefined
        const id = row.id + ':' + (day ?? row.scheduledAt)
        let next: number | undefined
        let error: string | undefined
        try {
          if (row.schedule?.kind === 'daily') next = dailyOccurrence(row.schedule.time, now, day)
          else if (row.schedule?.kind === 'interval') next = intervalOccurrence(row.schedule.minutes, now, row.scheduledAt)
          else if (row.schedule && row.schedule.kind !== 'once') throw new Error('Invalid saved schedule.')
        } catch (err) { error = (err as Error).message }
        const alreadyClaimed = (day !== undefined && row.lastDay !== undefined && row.lastDay >= day) ||
          !!await db.deliveries.get(id)
        await db.reminders.update(row.id, { enabled: next !== undefined, scheduledAt: next ?? row.scheduledAt,
          lastDay: day && (!row.lastDay || day > row.lastDay) ? day : row.lastDay, timezone: zone, deliveredAt: now, updatedAt: now })
        if (alreadyClaimed) continue
        const late = now - row.scheduledAt > graceMs
        const full = claims.length >= queueLimit
        const delivery: Delivery = { id, reminderId: row.id, scheduledAt: row.scheduledAt, message: row.message || row.title,
          status: error ? 'error' : late || full ? 'skipped' : 'pending',
          error: error ?? (late ? 'Outside the one-minute delivery window.' : full ? 'Foreground reminder queue was full.' : undefined) }
        await db.deliveries.add(delivery)
        if (delivery.status === 'pending') claims.push({ reminder: row, delivery })
      }
      return claims
    })
  }

  const markStarted = (id: string, time = Date.now()) =>
    db.deliveries.where('id').equals(id).filter(row => row.status === 'pending').modify({ triggeredAt: time })
  const finish = (id: string, result: DeliveryResult) =>
    db.deliveries.where('id').equals(id).filter(row => row.status === 'pending').modify(result)
  const clearHistory = () => db.deliveries.filter(row => row.status !== 'pending' || row.scheduledAt < Date.now() - 3_600_000).delete()
  return { list, pendingRows, history, save, setEnabled, remove, reconcile, markStarted, finish, clearHistory }
}
