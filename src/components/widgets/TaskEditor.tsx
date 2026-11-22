import { useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react'
import type { Task } from '../../types/models'
import type { TaskTree } from '../../storage/taskTree'
import type { TaskRemoval } from '../../storage/taskRepository'
import { taskRepository } from '../../storage/repositories'
import { TaskEditorDialog, type EditMode } from './TaskEditorDialog'

type Group = TaskTree['categories'][number]
interface Props {
  tree: TaskTree
  active: Group | undefined
  select: (id: string) => void
  rows: { task: Task; depth: number; branch: boolean }[]
  open: Set<string>
  expand: (id: string) => void
  reveal: (id: string) => void
  toggle: (id: string) => Promise<void>
}

export function TaskEditor({ tree, active, select, rows, open, expand, reveal, toggle }: Props) {
  const [edit, setEdit] = useState<EditMode>()
  const [undo, setUndo] = useState<TaskRemoval>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const index = tree.categories.findIndex(category => category.id === active?.id)
  async function run(action: () => Promise<unknown>) {
    setError('')
    try { await action() } catch (error) {
      setError(error instanceof Error ? error.message : 'The change could not be saved.')
    }
  }

  return <div className="task-editor">
    <div className="task-toolbar">
      {active && <>
        <button type="button" className="widget-action" onClick={() => setEdit({ kind: 'category', category: active })}>Edit category</button>
        <button type="button" className="widget-action" onClick={() => setEdit({ kind: 'delete-category', category: active })}>Delete category</button>
        <button type="button" className="widget-action" aria-label="Move category up" disabled={index <= 0}
          onClick={() => void run(() => taskRepository.reorderCategory(active.id, -1))}><ArrowUp /></button>
        <button type="button" className="widget-action" aria-label="Move category down" disabled={index >= tree.categories.length - 1}
          onClick={() => void run(() => taskRepository.reorderCategory(active.id, 1))}><ArrowDown /></button>
        <button type="button" className="widget-action task-primary"
          onClick={() => setEdit({ kind: 'task', categoryId: active.id })}>Add task</button>
      </>}
    </div>
    <div className="task-editor-summary">
      {undo && <button type="button" className="widget-action" disabled={restoring} onClick={() => void run(async () => {
        setRestoring(true)
        try {
          await taskRepository.restore(undo)
          if (undo.category) select(undo.category.id)
          setUndo(undefined)
          setMessage('Restored.')
        } finally { setRestoring(false) }
      })}>Undo deletion</button>}
      <span role="status">{message}</span>
    </div>
    {error && <p role="alert">{error}</p>}
    {rows.length ? <ul className="task-editor-list" aria-label="Task hierarchy">
      {rows.map(({ task, depth, branch }) => {
        const count = tree.perTask.get(task.id)!
        const done = count.done === count.total
        const mixed = !done && count.done > 0
        const parent = tree.parents.get(task.id)
        const siblings = parent ? tree.children.get(parent)! : tree.roots.get(task.categoryId)!
        const rank = siblings.indexOf(task)
        return <li key={task.id} data-completed={done} style={{ '--task-depth': Math.min(depth, 8) } as CSSProperties}>
          <button type="button" role="checkbox" className="task-check" aria-checked={mixed ? 'mixed' : done}
            aria-label={task.title} onClick={() => void toggle(task.id)}>
            <span className="task-mark" aria-hidden="true">{done ? '✓' : mixed ? '−' : null}</span>
          </button>
          {branch ? <button type="button" className="task-disclosure" aria-expanded={open.has(task.id)}
            aria-label={`Subtasks of ${task.title}`} onClick={() => expand(task.id)}>
            {open.has(task.id) ? <ChevronDown /> : <ChevronRight />}
          </button> : <span />}
          <div className="task-row-copy">
            <span className="task-title">{task.title}</span>
            {(branch || task.dueDate || task.description) && <small>
              {branch && `${count.done}/${count.total} complete. `}
              {task.dueDate && `Due ${task.dueDate}. `}
              {task.description}
            </small>}
          </div>
          <div className="task-row-actions">
            <button type="button" className="widget-action" aria-label={`Move ${task.title} up`} disabled={rank <= 0}
              onClick={() => void run(() => taskRepository.reorderTask(task.id, -1))}><ArrowUp /></button>
            <button type="button" className="widget-action" aria-label={`Move ${task.title} down`} disabled={rank >= siblings.length - 1}
              onClick={() => void run(() => taskRepository.reorderTask(task.id, 1))}><ArrowDown /></button>
            <button type="button" className="widget-action" aria-label={`Add subtask to ${task.title}`}
              onClick={() => setEdit({ kind: 'task', categoryId: task.categoryId, parentId: task.id })}>Add subtask</button>
            <button type="button" className="widget-action" aria-label={`Edit ${task.title}`}
              onClick={() => setEdit({ kind: 'task', task, categoryId: task.categoryId })}>Edit</button>
            <button type="button" className="widget-action" aria-label={`Delete ${task.title}`}
              onClick={() => setEdit({ kind: 'delete-task', task })}>Delete</button>
          </div>
        </li>
      })}
    </ul> : <p>{active ? 'This category is empty. Add a task to get started.' : 'Create a category to organize your tasks.'}</p>}
    {edit && <TaskEditorDialog mode={edit} tree={tree} close={() => setEdit(undefined)} select={select} reveal={reveal}
      removed={removal => {
        setUndo(removal ?? undefined)
        setMessage(removal ? 'Deleted.' : 'Tasks moved and category deleted.')
      }} />}
  </div>
}
