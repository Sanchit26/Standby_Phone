import { createFocusRepository } from './focusRepository'
import { db } from './database'
import { newEntity } from './entity'
import { createTaskRepository } from './taskRepository'
import type { FocusSession } from '../types/models'

export { newEntity }
export const taskRepository = createTaskRepository(db)

export const focusTimer = createFocusRepository(db)

export const focusSessions = {
  forTask: (id: string) => db.focusSessions.where('taskId').equals(id).sortBy('startedAt'),
  record: (session: Pick<FocusSession, 'startedAt' | 'endedAt' | 'taskId'>) =>
    db.focusSessions.add({ ...session, ...newEntity() }),
}
