import type { CalendarEvent } from '../types/models.ts'
import { localDate } from './calendar.ts'

export interface DeviceOccurrence {
  calendarId: string
  eventId: string
  title: string
  begin: number
  end: number
  allDay: boolean
  color?: string
}
export type CalendarEntry = {
  key: string; day: string; title: string; start: string; end: string; allDay: boolean; color?: string
} & ({ source: 'local'; local: CalendarEvent } | {
  source: 'device'; device: DeviceOccurrence; continuation: boolean
})

const localTime = (time: number) => new Date(time).toTimeString().slice(0, 5)
const utcDate = (time: number) => new Date(time).toISOString().slice(0, 10)
const dateStamp = (day: string, utc: boolean) => +new Date(day + (utc ? 'T00:00:00Z' : 'T00:00:00'))

export function deviceEntries(rows: readonly DeviceOccurrence[], first: string, next: string) {
  const byDay = new Map<string, CalendarEntry[]>()
  const seen = new Set<string>()
  for (const row of rows) {
    if (![row.begin, row.end].every(time => Number.isFinite(time) && Math.abs(time) <= 8.64e15) ||
        row.end < row.begin || !row.calendarId || !row.eventId) continue
    const key = `device:${row.calendarId}:${row.eventId}:${row.begin}`
    if (seen.has(key)) continue
    seen.add(key)
    const asDay = row.allDay ? utcDate : (time: number) => localDate(new Date(time))
    const startDay = asDay(row.begin)
    // Provider all-day occurrences use UTC dates. All ends are exclusive.
    const endDay = asDay(Math.max(row.begin, row.end - 1))
    const day = new Date((first > startDay ? first : startDay) + 'T12:00:00')
    for (let date = localDate(day); date < next && date <= endDay; date = localDate(day)) {
      const start = !row.allDay && date === startDay ? localTime(row.begin) : ''
      day.setDate(day.getDate() + 1)
      const clippedEnd = dateStamp(localDate(day), row.allDay)
      const end = !row.allDay && row.end > row.begin && row.end < clippedEnd ? localTime(row.end) : ''
      const entry: CalendarEntry = {
        key, day: date, title: row.title?.trim() || 'Untitled event', allDay: row.allDay, start, end,
        color: row.color && /^#[0-9a-f]{6}$/i.test(row.color) ? row.color : undefined,
        source: 'device', device: row, continuation: date !== startDay || row.end > clippedEnd,
      }
      const entries = byDay.get(date)
      if (entries) entries.push(entry)
      else byDay.set(date, [entry])
    }
  }
  return byDay
}

export function mergeCalendarDay(local: readonly CalendarEvent[], device: readonly CalendarEntry[] = []) {
  const entries: CalendarEntry[] = [...device, ...local.map((row): CalendarEntry =>
    ({ ...row, key: 'local:' + row.id, source: 'local', local: row }))]
  return entries.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) ||
    a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
}

export const mergeEventDates = (local: ReadonlySet<string> | undefined, device: ReadonlyMap<string, CalendarEntry[]> | undefined) =>
  new Set([...(local ?? []), ...(device?.keys() ?? [])])
