interface Entity {
  id: string
  createdAt: number
  updatedAt: number
}
export interface TaskCategory extends Entity {
  name: string
  color?: 'blue' | 'mint' | 'amber' | 'rose' | 'violet'
  sortOrder: number
}
export interface Task extends Entity {
  categoryId: string
  parentId?: string
  title: string
  description?: string
  dueDate?: string
  completed: boolean
  sortOrder: number
}
export interface FocusSession extends Entity {
  mode?: 'countdown' | 'stopwatch'
  label?: string
  status?: 'completed' | 'cancelled'
  plannedMs?: number
  elapsedMs?: number
  startedAt: number
  endedAt?: number
  taskId?: string
}
export type ReminderSchedule = { kind: 'once'; at: number } | { kind: 'daily'; time: string } | { kind: 'interval'; minutes: number }
export interface Reminder extends Entity {
  schedule?: ReminderSchedule
  voice?: string
  rate?: number
  volume?: number
  timezone?: string
  lastDay?: string
  title: string
  message?: string
  sound?: string
  scheduledAt: number
  enabled: boolean
  channel: 'in-app' | 'native'
  deliveredAt?: number
}

export interface CalendarEvent extends Entity {
  day: string; title: string; description: string; start: string; end: string; allDay: boolean; color: string
}
export interface MediaItem extends Entity {
  name: string; kind: 'image' | 'video'; storage: 'file' | 'blob'; mime?: string; size: number; sortOrder: number
}
export interface Delivery {
  id: string; reminderId: string; scheduledAt: number; triggeredAt?: number
  message?: string
  status: 'unconfirmed' | 'pending' | 'spoken' | 'skipped' | 'error' | 'silenced'; error?: string
}
