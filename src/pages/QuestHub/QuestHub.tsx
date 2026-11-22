import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDisplay } from '../../app/contexts'
import { TasksWidget } from '../../components/widgets/TasksWidget'
import { TaskEditorDialog } from '../../components/widgets/TaskEditorDialog'
import { useQuery } from '../../hooks/useQuery'
import { readTasks } from '../../storage/taskQueries'
import { Ornament } from '../../themes/Ornament'

export function QuestHub() {
  const { data: tree, error } = useQuery(readTasks)
  const { prefs, update } = useDisplay()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const select = (id: string) => setParams({ list: id })
  const active = tree?.categories.find(group => group.id === params.get('list'))
  return <section className="workspace-page">
    <header className="page-heading"><h1>{active ? active.name : 'Quest Hub'}</h1>
      {active ? <div><Link className="widget-action" to="/quests">All lists</Link>
        <button className="widget-action primary" onClick={() => {
          update({ taskCategory: active.id, widget: 'tasks', widgetEnabled: [...prefs.widgetEnabled, 'tasks'] })
          navigate('/')
        }}>Start Task</button></div> : <button className="widget-action primary" onClick={() => setAdding(true)}>Add To-Do List</button>}
    </header>
    {error && <p role="alert">{error}</p>}
    {active ? <TasksWidget expanded categoryId={active.id} onSelect={select} /> : <>
      {tree && !tree.categories.length && <p>Create your first to-do list to organize tasks.</p>}
      <div className="list-grid">{tree?.categories.map(({ id, name, progress }) =>
        <button key={id} className="list-card theme-panel" onClick={() => select(id)}>
          <Ornament /><strong>{name}</strong>{id === prefs.taskCategory && <small>Active on Standby</small>}
          <span>{progress.done} / {progress.total} {progress.total ? ' · ' + Math.round(progress.percent) + '%' : ' · Empty list'}</span>
          <progress aria-label={name} className="widget-progress task-progress" value={progress.done} max={progress.total || 1} />
        </button>)}</div>
    </>}
    {adding && tree && <TaskEditorDialog mode={{ kind: 'category' }} tree={tree} close={() => setAdding(false)}
      select={select} reveal={() => {}} removed={() => {}} />}
  </section>
}
