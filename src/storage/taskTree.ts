import type { Task, TaskCategory } from '../types/models.ts'

export const categoryColors = {
  blue: '#91bafa', mint: '#83d8b0', amber: '#edc174', rose: '#f2a4b5', violet: '#c6aff8',
} as const

export interface Progress {
  total: number
  done: number
  pending: number
  percent: number
}

const ordered = <T extends { id: string; sortOrder: number }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)

function progress(total: number, done: number): Progress {
  return { total, done, pending: total - done, percent: total ? Math.round(done * 100 / total) : 0 }
}

export function buildTaskTree(categories: readonly TaskCategory[], tasks: readonly Task[]) {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const parents = new Map<string, string>()
  for (const task of tasks) {
    const parent = task.parentId === undefined ? undefined : byId.get(task.parentId)
    if (parent && parent.id !== task.id && parent.categoryId === task.categoryId) parents.set(task.id, parent.id)
  }
  // Following each chain once lets us cut a cycle without losing its tasks.
  const settled = new Set<string>()
  for (const task of tasks) {
    const path = new Set<string>()
    let id: string | undefined = task.id
    while (id !== undefined && !settled.has(id)) {
      if (path.has(id)) { parents.delete(id); break }
      path.add(id)
      id = parents.get(id)
    }
    for (const visited of path) settled.add(visited)
  }

  const roots = new Map<string, Task[]>()
  const children = new Map<string, Task[]>()
  for (const task of [...tasks].sort(ordered)) {
    const parentId = parents.get(task.id)
    const list = parentId === undefined ? roots : children
    const key = parentId ?? task.categoryId
    const siblings = list.get(key)
    if (siblings) siblings.push(task)
    else list.set(key, [task])
  }

  const stack = [...roots.values()].flat()
  const preorder: Task[] = []
  while (stack.length) {
    const task = stack.pop()!
    preorder.push(task)
    for (const child of children.get(task.id) ?? []) stack.push(child)
  }
  const perTask = new Map<string, Progress>()
  const counts = new Map<string, { total: number; done: number }>()
  let total = 0
  let done = 0
  for (const task of preorder.reverse()) {
    const descendants = children.get(task.id)
    if (descendants?.length) {
      let leaves = 0
      let completed = 0
      for (const child of descendants) {
        const count = perTask.get(child.id)!
        leaves += count.total
        completed += count.done
      }
      perTask.set(task.id, progress(leaves, completed))
    } else {
      const completed = task.completed ? 1 : 0
      perTask.set(task.id, progress(1, completed))
      const count = counts.get(task.categoryId) ?? { total: 0, done: 0 }
      count.total++
      count.done += completed
      counts.set(task.categoryId, count)
      total++
      done += completed
    }
  }
  return {
    byId, parents, roots, children, perTask, overall: progress(total, done),
    categories: [...categories].sort(ordered).map(category => {
      const count = counts.get(category.id)
      return { ...category, progress: progress(count?.total ?? 0, count?.done ?? 0) }
    }),
  }
}

export type TaskTree = ReturnType<typeof buildTaskTree>

export function subtree(tree: TaskTree, task: Task): Task[] {
  const items: Task[] = []
  const remaining = [task]
  while (remaining.length) {
    const current = remaining.pop()!
    items.push(current)
    for (const child of tree.children.get(current.id) ?? []) remaining.push(child)
  }
  return items
}

export function repairTaskLinks(tree: TaskTree) {
  return [...tree.byId.values()].flatMap(task => {
    const parentId = tree.parents.get(task.id)
    const state = tree.perTask.get(task.id)!
    const completed = state.done === state.total
    return task.parentId !== parentId || task.completed !== completed ? [{ ...task, parentId, completed }] : []
  })
}
