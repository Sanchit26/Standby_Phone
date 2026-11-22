import type { StandbyDatabase } from './database.ts'
import type { UserPreferences } from '../services/preferences.ts'

export async function createBackup(db: StandbyDatabase, prefs: UserPreferences, now = Date.now()) {
  return db.transaction('r', db.categories, db.tasks, db.events, db.focusSessions, db.reminders, async () => {
    const [categories, tasks, events, focusSessions, reminders] = await Promise.all([
      db.categories.toArray(), db.tasks.toArray(), db.events.toArray(), db.focusSessions.toArray(),
      db.reminders.filter(row => row.channel === 'in-app').toArray(),
    ])
    const { deviceCalendar: _deviceCalendar, ...display } = prefs
    return {
      format: 'standby-backup', version: 1, exportedAt: new Date(now).toISOString(),
      categories, tasks, events, focusSessions, reminders, display,
    } as const
  })
}
