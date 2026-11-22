import type { StandbyDatabase } from './database.ts'
import type { CalendarEvent } from '../types/models.ts'
import { newEntity } from './entity.ts'

export function localDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
export const dayEvents = (db: StandbyDatabase, day: string) =>
  db.events.where('day').equals(day).sortBy('start')
export async function saveEvent(db: StandbyDatabase, fields: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>, id?: string) {
  const title = fields.title.trim()
  if (!title || localDate(new Date(fields.day + 'T12:00:00')) !== fields.day) throw new Error('Enter a title and a valid date.')
  const start = fields.allDay ? '' : fields.start
  const end = fields.allDay ? '' : fields.end
  if ([start, end].some(t => t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || (start && end && start > end)) throw new Error('Check the start and end times.')
  return db.transaction('rw', db.events, async () => {
    const old = id ? await db.events.get(id) : undefined
    if (id && !old) throw new Error('This event was removed.')
    return db.events.put({ ...(old ?? newEntity()), ...fields, title, start, end, updatedAt: Date.now() })
  })
}
