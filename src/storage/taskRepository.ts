import type { StandbyDatabase } from './database.ts'
import { newEntity } from './entity.ts'
import { buildTaskTree, categoryColors, repairTaskLinks, subtree } from './taskTree.ts'
import type { Task, TaskCategory } from '../types/models.ts'

type TaskFields = Pick<Task, 'title' | 'description' | 'dueDate' | 'categoryId' | 'parentId'>
type CategoryFields = Pick<TaskCategory, 'name' | 'color'>
type Removal = { tasks: Task[]; category?: TaskCategory }

function required(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  return trimmed
}

function nextOrder(items: readonly { sortOrder: number }[]) {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
}

export function createTaskRepository(db: StandbyDatabase) {
  const snapshot = async () => buildTaskTree(await db.categories.toArray(), await db.tasks.toArray())
  const write = <T>(operation: (tree: Awaited<ReturnType<typeof snapshot>>, now: number) => Promise<T>) =>
    db.transaction('rw', db.categories, db.tasks, async () => {
      const now = Date.now()
      const result = await operation(await snapshot(), now)
      const changes = repairTaskLinks(await snapshot())
      if (changes.length) await db.tasks.bulkPut(changes.map(task => ({ ...task, updatedAt: now })))
      return result
    })

  return {
    saveCategory(fields: CategoryFields, id?: string) {
      return write(async (tree, now) => {
        const name = required(fields.name, 'Category name')
        const color = fields.color
        if (color !== undefined && !Object.hasOwn(categoryColors, color)) throw new Error('Choose a category accent.')
        const category = tree.categories.find(item => item.id === id)
        if (id !== undefined && !category) throw new Error('This category no longer exists.')
        if (category) {
          await db.categories.update(category.id, { name, color, updatedAt: now })
          return category.id
        }
        const row = { ...newEntity(now), name, color, sortOrder: nextOrder(tree.categories) }
        await db.categories.add(row)
        return row.id
      })
    },

    saveTask(fields: TaskFields, id?: string) {
      return write(async (tree, now) => {
        const { categoryId, parentId, dueDate } = fields
        const title = required(fields.title, 'Task title')
        const description = fields.description?.trim() || undefined
        if (dueDate !== undefined) {
          const date = new Date(dueDate + 'T00:00:00Z')
          if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate) {
            throw new Error('Choose a valid due date.')
          }
        }
        if (!tree.categories.some(category => category.id === categoryId)) throw new Error('This category no longer exists.')
        const existing = id === undefined ? undefined : tree.byId.get(id)
        if (id !== undefined && !existing) throw new Error('This task no longer exists.')
        const branch = existing ? subtree(tree, existing) : []
        if (parentId !== undefined && (tree.byId.get(parentId)?.categoryId !== categoryId ||
            branch.some(task => task.id === parentId))) throw new Error('Choose a parent outside this task’s descendants.')
        const siblings = parentId === undefined ? tree.roots.get(categoryId) : tree.children.get(parentId)
        const sortOrder = existing && existing.categoryId === categoryId && existing.parentId === parentId
          ? existing.sortOrder : nextOrder(siblings ?? [])
        const task = {
          ...(existing ?? { ...newEntity(now), completed: false }),
          title, description, categoryId, parentId, dueDate, sortOrder, updatedAt: now,
        }
        await db.tasks.put(task)
        if (existing && existing.categoryId !== categoryId && branch.length > 1) {
          await db.tasks.bulkPut(branch.slice(1).map(child => ({ ...child, categoryId, updatedAt: now })))
        }
        return task.id
      })
    },

    toggle(id: string) {
      return write(async (tree, now) => {
        const task = tree.byId.get(id)
        if (!task) throw new Error('This task no longer exists.')
        const progress = tree.perTask.get(id)!
        const completed = progress.done !== progress.total
        const branch = subtree(tree, task)
        await db.tasks.bulkPut(branch.map(row => ({ ...row, completed, updatedAt: now })))
      })
    },

    reorderTask(id: string, step: -1 | 1) {
      return write(async (tree, now) => {
        const task = tree.byId.get(id)
        if (!task) throw new Error('This task no longer exists.')
        const parent = tree.parents.get(id)
        const items = [...(parent === undefined ? tree.roots.get(task.categoryId) : tree.children.get(parent)) ?? []]
        const index = items.findIndex(row => row.id === id)
        if (!items[index + step]) return
        items.splice(index, 1)
        items.splice(index + step, 0, task)
        await db.tasks.bulkPut(items.map((row, sortOrder) => ({ ...row, sortOrder, updatedAt: now })))
      })
    },

    reorderCategory(id: string, step: -1 | 1) {
      return write(async (tree, now) => {
        const index = tree.categories.findIndex(category => category.id === id)
        if (index < 0) throw new Error('This category no longer exists.')
        if (!tree.categories[index + step]) return
        const items = [...tree.categories]
        const [category] = items.splice(index, 1)
        items.splice(index + step, 0, category)
        await Promise.all(items.map((row, sortOrder) => db.categories.update(row.id, { sortOrder, updatedAt: now })))
      })
    },

    deleteTask(id: string) {
      return write(async (tree): Promise<Removal> => {
        const root = tree.byId.get(id)
        if (!root) throw new Error('This task no longer exists.')
        const tasks = subtree(tree, root)
        await db.tasks.bulkDelete(tasks.map(task => task.id))
        return { tasks }
      })
    },

    deleteCategory(id: string, action: { kind: 'empty' | 'delete' } | { kind: 'move'; to: string }) {
      return write(async (tree, now): Promise<Removal | null> => {
        const category = await db.categories.get(id)
        if (!category) throw new Error('This category no longer exists.')
        const tasks = [...tree.byId.values()].filter(task => task.categoryId === id)
        if (action.kind === 'empty' && tasks.length) throw new Error('This category has tasks. Choose whether to move or delete them.')
        if (action.kind === 'move') {
          const { to } = action
          if (to === id || !tree.categories.some(item => item.id === to)) throw new Error('Choose another category.')
          const first = nextOrder(tree.roots.get(to) ?? [])
          const ranks = new Map((tree.roots.get(id) ?? []).map((root, rank) => [root.id, first + rank]))
          await db.tasks.bulkPut(tasks.map(task => ({ ...task, categoryId: to, sortOrder: ranks.get(task.id) ?? task.sortOrder, updatedAt: now })))
        } else await db.tasks.bulkDelete(tasks.map(task => task.id))
        await db.categories.delete(id)
        return action.kind === 'move' ? null : { category, tasks }
      })
    },

    restore(removal: Removal) {
      return write(async (tree, now) => {
        const { category, tasks } = removal
        if (category) await db.categories.add({ ...category, updatedAt: now })
        const restoring = new Set(tasks.map(task => task.id))
        for (const task of tasks) {
          if (task.categoryId !== category?.id && !tree.categories.some(item => item.id === task.categoryId)) {
            throw new Error('The original category no longer exists.')
          }
          if (task.parentId !== undefined && !restoring.has(task.parentId) &&
              tree.byId.get(task.parentId)?.categoryId !== task.categoryId) {
            throw new Error('The original parent no longer belongs to this category.')
          }
        }
        await db.tasks.bulkAdd(tasks.map(task => ({ ...task, updatedAt: now })))
      })
    },
  }
}

export type TaskRemoval = Removal
