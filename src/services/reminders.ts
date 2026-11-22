import { db } from '../storage/database'
import { newEntity } from '../storage/repositories'
import type { Reminder } from '../types/models'

type ReminderInput = Pick<Reminder, 'title' | 'message' | 'scheduledAt' | 'sound'>
export interface InAppScheduler {
  schedule(input: ReminderInput): Promise<string>
  due(now?: number): Promise<Reminder[]>
  markDelivered(id: string, at?: number): Promise<void>
  history(): Promise<Reminder[]>
}

// A foreground presenter can query due() on resume and acknowledge after display.
export const inAppReminders: InAppScheduler = {
  schedule: input => db.reminders.add({ ...input, ...newEntity(), channel: 'in-app', enabled: true }),
  due: (now = Date.now()) => db.reminders.where('[channel+scheduledAt]')
    .between(['in-app', -Infinity], ['in-app', now], true, true)
    .filter(r => r.enabled && r.deliveredAt === undefined).toArray(),
  async markDelivered(id, at = Date.now()) {
    await db.reminders.where('id').equals(id)
      .filter(r => r.channel === 'in-app' && r.enabled && r.deliveredAt === undefined)
      .modify({ deliveredAt: at, updatedAt: at })
  },
  history: () => db.reminders.orderBy('deliveredAt').reverse().filter(r => r.channel === 'in-app').toArray(),
}
