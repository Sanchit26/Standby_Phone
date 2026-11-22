import { Ornament } from '../../themes/Ornament'
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { Task, TaskCategory } from '../../types/models'
import { categoryColors, subtree, type TaskTree } from '../../storage/taskTree'
import type { TaskRemoval } from '../../storage/taskRepository'
import { taskRepository } from '../../storage/repositories'

export type EditMode =
  | { kind: 'category'; category?: TaskCategory }
  | { kind: 'task'; categoryId: string; task?: Task; parentId?: string }
  | { kind: 'delete-task'; task: Task }
  | { kind: 'delete-category'; category: TaskCategory }

interface Props {
  mode: EditMode
  tree: TaskTree
  close: () => void
  select: (id: string) => void
  reveal: (id: string) => void
  removed: (removal: TaskRemoval | null) => void
}

export function TaskEditorDialog({ mode, tree, close, select, reveal, removed }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const task = mode.kind === 'task' ? mode.task : undefined
  const category = mode.kind === 'category' ? mode.category : undefined
  const [name, setName] = useState(task?.title ?? category?.name ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [due, setDue] = useState(task?.dueDate ?? '')
  const [color, setColor] = useState<NonNullable<TaskCategory['color']> | ''>(category?.color ?? '')
  const [group, setGroup] = useState(mode.kind === 'task' ? mode.categoryId : '')
  const [parent, setParent] = useState(task?.parentId ?? (mode.kind === 'task' ? mode.parentId : '') ?? '')
  const [moveTo, setMoveTo] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  const blocked = new Set(task ? subtree(tree, task).map(item => item.id) : [])
  const heading = mode.kind === 'task' ? task ? 'Edit task' : mode.parentId ? 'Add subtask' : 'Add task'
    : mode.kind === 'category' ? category ? 'Edit category' : 'New category'
      : mode.kind === 'delete-task' ? 'Delete task' : 'Delete category'

  async function execute(action: () => Promise<void>) {
    setPending(true)
    setError('')
    try { await action(); close() } catch (error) {
      setError(error instanceof Error ? error.message : 'The change could not be saved.')
      setPending(false)
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    void execute(async () => {
      if (mode.kind === 'category') {
        select(await taskRepository.saveCategory({ name, color: color || undefined }, category?.id))
      } else if (mode.kind === 'task') {
        await taskRepository.saveTask({
          title: name, description, dueDate: due || undefined, categoryId: group, parentId: parent || undefined,
        }, task?.id)
        select(group)
        if (parent) reveal(parent)
      } else if (mode.kind === 'delete-task') {
        removed(await taskRepository.deleteTask(mode.task.id))
      } else {
        removed(await taskRepository.deleteCategory(mode.category.id, { kind: 'delete' }))
      }
    })
  }

  return <dialog ref={dialog} className="widget-dialog task-form-dialog theme-panel" data-page-swipe="off"
    aria-labelledby="task-form-title" onCancel={event => { event.stopPropagation(); event.preventDefault(); if (!pending) close() }}>
    <Ornament />
    <form onSubmit={submit}>
      <h2 id="task-form-title">{heading}</h2>
      {mode.kind === 'category' && <>
        <label>Category name<input required autoFocus value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Category accent<select value={color} onChange={event => setColor(event.target.value as typeof color)}>
          <option value="">Theme default</option>
          {Object.keys(categoryColors).map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </>}
      {mode.kind === 'task' && <>
        <label>Task title<input required autoFocus value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Description<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <div className="task-form-columns">
          <label>Due date<input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
          <label>Category<select aria-label="Category" value={group} onChange={event => { setGroup(event.target.value); setParent('') }}>
            {tree.categories.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <label>Parent task<select value={parent} onChange={event => setParent(event.target.value)}>
            <option value="">Top level</option>
            {[...tree.byId.values()].filter(row => row.categoryId === group && !blocked.has(row.id)).map(row =>
              <option key={row.id} value={row.id}>{row.title}</option>)}
          </select></label>
        </div>
      </>}
      {mode.kind === 'delete-task' && <p>Delete “{mode.task.title}” and all its subtasks? You can undo the latest deletion while Tasks stays expanded.</p>}
      {mode.kind === 'delete-category' && <>
        <p>Deleting “{mode.category.name}” also deletes all its tasks and subtasks. To keep them, choose another category and move them first.</p>
        {tree.categories.length > 1 && <div className="task-move-category">
          <label>Move tasks to<select value={moveTo} onChange={event => setMoveTo(event.target.value)}>
            <option value="">Choose a category</option>
            {tree.categories.filter(category => category.id !== mode.category.id).map(category =>
              <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <button type="button" className="widget-action" disabled={pending || !moveTo} onClick={() => void execute(async () => {
            await taskRepository.deleteCategory(mode.category.id, { kind: 'move', to: moveTo })
            select(moveTo)
            removed(null)
          })}>Move tasks and delete category</button>
        </div>}
      </>}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" className="widget-action" autoFocus={mode.kind.startsWith('delete')} disabled={pending} onClick={close}>Cancel</button>
        <button type="submit" className="widget-action task-primary" disabled={pending}>
          {mode.kind === 'delete-category' ? 'Delete category and tasks' : mode.kind === 'delete-task' ? 'Delete task and subtasks' : 'Save'}
        </button>
      </footer>
    </form>
  </dialog>
}
