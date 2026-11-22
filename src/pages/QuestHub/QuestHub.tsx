import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDisplay } from '../../app/contexts'
import { TasksWidget } from '../../components/widgets/TasksWidget'
import { TaskEditorDialog } from '../../components/widgets/TaskEditorDialog'
import { useQuery } from '../../hooks/useQuery'
import { readTasks } from '../../storage/taskQueries'
import { Ornament } from '../../themes/Ornament'
import './quests.css'

export function QuestHub() {
  const { data: tree, error } = useQuery(readTasks)
  const { prefs, update } = useDisplay()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const select = (id: string) => setParams({ list: id })
  const active = tree?.categories.find(group => group.id === params.get('list'))
  return <section className="workspace-page quest-hub">
    <header className="page-heading"><h1>{active ? active.name : 'Quest Hub'}</h1>
      {active ? <div className="page-actions"><Link className="widget-action" to="/quests">All lists</Link>
        <button className="widget-action primary" onClick={() => {
          update({ taskCategory: active.id, widget: 'tasks', widgetEnabled: [...prefs.widgetEnabled, 'tasks'] })
          navigate('/')
        }}>Start Task</button></div> : <button className="widget-action primary" onClick={() => setAdding(true)}>Add To-Do List</button>}
    </header>
    {error && <p role="alert">{error}</p>}
    {active ? <div className="workspace-panel theme-panel"><Ornament />
      <TasksWidget expanded categoryId={active.id} onSelect={select} />
    </div> : <>
      {tree && !tree.categories.length && <p>Create your first to-do list to organize tasks.</p>}
      <div className="list-grid">{tree?.categories.map(({ id, name, progress }) =>
        <button key={id} className="list-card workspace-panel theme-panel" data-active={id === prefs.taskCategory} onClick={() => select(id)}>
          <Ornament /><strong>{name}</strong>{id === prefs.taskCategory && <small>Active on Standby</small>}
          <span>{progress.done} / {progress.total} {progress.total ? ' · ' + Math.round(progress.percent) + '%' : ' · Empty list'}</span>
          <progress aria-label={name} className="widget-progress task-progress" value={progress.done} max={progress.total || 1} />
        </button>)}</div>
    </>}
    {adding && tree && <TaskEditorDialog mode={{ kind: 'category' }} tree={tree} close={() => setAdding(false)}
      select={select} reveal={() => {}} removed={() => {}} />}
  </section>
}
