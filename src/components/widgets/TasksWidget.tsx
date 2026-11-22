import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useDisplay } from '../../app/contexts'
import { observeTasks } from '../../storage/taskQueries'
import { categoryColors, type TaskTree } from '../../storage/taskTree'
import { taskRepository } from '../../storage/repositories'
import { TaskEditor } from './TaskEditor'
import './tasks.css'

export function TasksWidget({ expanded, categoryId, onSelect }: { expanded: boolean; categoryId?: string; onSelect?: (id: string) => void }) {
  const { prefs } = useDisplay()
  const [tree, setTree] = useState<TaskTree>()
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(new Set<string>())
  useEffect(() => {
    const subscription = observeTasks().subscribe({
      next: setTree,
      error: () => setLoadError(true),
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loadError) return <p role="alert">Tasks could not be loaded.</p>
  if (!tree) return <p>Loading tasks…</p>
  const active = tree.categories.find(category => category.id === (categoryId ?? prefs.taskCategory))
  function expand(id: string) {
    setOpen(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  async function toggle(id: string) {
    setError('')
    try { await taskRepository.toggle(id) } catch { setError('Could not update task completion.') }
  }

  const count = active?.progress
  const roots = active ? tree.roots.get(active.id) ?? [] : []
  const stack = [...roots].reverse().map(task => ({ task, depth: 0 }))
  const rows = []
  while (stack.length) {
    const row = stack.pop()!
    const children = tree.children.get(row.task.id) ?? []
    rows.push({ ...row, branch: children.length > 0 })
    if (open.has(row.task.id)) {
      for (let index = children.length - 1; index >= 0; index--) {
        stack.push({ task: children[index], depth: row.depth + 1 })
      }
    }
  }

  return <section className="tasks-widget" aria-label={categoryId ? "Category tasks" : undefined}
    aria-labelledby={categoryId ? undefined : "tasks-heading"}
    style={active?.color && categoryColors[active.color]
      ? { '--widget-accent': categoryColors[active.color] } as CSSProperties : undefined}>
    {!categoryId && <header className="tasks-heading">
      <h2 id="tasks-heading" title={active?.name}>{active?.name ?? 'Tasks'}</h2>
      {!!count?.total && <span className="tasks-percent">{Math.round(count.percent)}%</span>}
    </header>}
    {!!count?.total && <>
      <progress className="widget-progress task-progress" aria-label="Task completion" value={count.done} max={count.total} />
      <div className="tasks-meta"><span>{count.done} of {count.total} complete{categoryId && " · " + Math.round(count.percent) + "%"}</span></div>
    </>}
    {error && <p role="alert">{error}</p>}
    {expanded && (active || categoryId) ? <TaskEditor tree={tree} active={active} select={onSelect ?? (() => {})} rows={rows} open={open} expand={expand}
      reveal={id => setOpen(previous => new Set([...previous, id]))} toggle={toggle} /> : null}
    <div hidden={expanded && !!active}>
      {rows.length ? <ul className="tasks-list" tabIndex={0} aria-label="Tasks in this category">
        {rows.map(({ task, depth, branch }) => {
          const progress = tree.perTask.get(task.id)!
          const done = progress.done === progress.total
          const mixed = !done && progress.done > 0
          return <li key={task.id} className="task-preview-row" data-completed={done}
            style={{ '--task-depth': Math.min(depth, 4) } as CSSProperties}>
            <button type="button" className="task-check" role="checkbox" aria-label={task.title}
              aria-checked={mixed ? 'mixed' : done} onClick={() => void toggle(task.id)}>
              <span className="task-mark" aria-hidden="true">{done ? <Check strokeWidth={3} /> : mixed ? '−' : null}</span>
            </button>
            <span className="task-title" title={task.title}>{task.title}</span>
            {branch && <button type="button" className="task-disclosure" aria-expanded={open.has(task.id)}
              aria-label={`Subtasks of ${task.title}`} onClick={() => expand(task.id)}>
              {open.has(task.id) ? <ChevronDown /> : <ChevronRight />}
            </button>}
          </li>
        })}
      </ul> : <p className="tasks-empty">{active ? 'This list has no tasks yet.' : 'Choose a list in Quest Hub and tap Start Task.'}</p>}
    </div>
    {expanded && !categoryId && <Link className="widget-action" to="/quests">Open Quest Hub</Link>}
  </section>
}
