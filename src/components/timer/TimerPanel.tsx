import { Ornament } from '../../themes/Ornament'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useTimer } from '../../app/contexts'
import { newEntity } from '../../storage/entity'
import { observeFocusTasks } from '../../storage/widgetStats'
import { Countdown, TimerProgress } from './Countdown'
import { minute, presets, validDuration, type TimerAction, type TimerMode } from './model'
import './focus.css'

export function TimerPanel({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { timer, dispatch, lastDuration, error, notice } = useTimer()
  const [label, setLabel] = useState('')
  const [duration, setDuration] = useState(String(lastDuration / minute))
  const [taskId, setTaskId] = useState('')
  const [tasks, setTasks] = useState<{ id: string; name: string; category: string }[]>([])
  const [taskError, setTaskError] = useState(false)
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [confirm, setConfirm] = useState<'reset' | 'cancel'>()
  const mode = timer.mode ?? 'countdown'
  const active = timer.status === 'running' || timer.status === 'paused'

  useLayoutEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => el?.close()
  }, [])
  useEffect(() => {
    const subscription = observeFocusTasks().subscribe({ next: setTasks, error: () => setTaskError(true) })
    return () => subscription.unsubscribe()
  }, [])

  async function act(action: TimerAction) {
    setPending(true)
    if (await dispatch(action)) setConfirm(undefined)
    setPending(false)
  }
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const mins = Number(duration)
    if (mode === 'countdown' && (!Number.isInteger(mins) || !validDuration(mins * minute))) { setInvalid(true); return }
    setInvalid(false)
    void act({ type: 'start', id: newEntity().id, label, durationMs: mins * minute, taskId: taskId || undefined })
  }

  return <dialog ref={dialog} className="widget-dialog focus-panel theme-panel" aria-labelledby="focus-panel-title"
    data-page-swipe="off" onCancel={event => { event.preventDefault(); close() }}>
    <Ornament />
    <header className="widget-dialog-header"><h2 id="focus-panel-title">Focus timer</h2>
      <button type="button" className="widget-action" autoFocus onClick={close}>Close</button>
    </header>
    <div className="focus-panel-body">
      <div className="focus-presets" role="group" aria-label="Timer mode">
        {(['countdown', 'stopwatch'] as TimerMode[]).map(item => <button className="widget-action" key={item} disabled={pending}
          aria-pressed={mode === item} onClick={() => {
            if (mode === item || (active && !window.confirm('Cancel the current session and switch timer mode?'))) return
            void act({ type: 'switch', mode: item, confirmedId: active ? timer.id : undefined })
          }}>{item === 'stopwatch' ? 'Stopwatch' : 'Countdown'}</button>)}
      </div>
      {active && <div className="focus-current"><Countdown /><TimerProgress /></div>}
      {!active && timer.status !== 'idle' && <div className="focus-previous">
        {timer.label} · {timer.status === 'cancelled' ? 'Cancelled' : 'Complete'}
      </div>}
      {active ? <div className="focus-actions">
        <button type="button" className="widget-action focus-primary" disabled={pending}
          onClick={() => void act({ type: timer.status === 'running' ? 'pause' : 'resume' })}>
          {timer.status === 'running' ? 'Pause' : 'Resume'}
        </button>
        <button type="button" className="widget-action" disabled={pending} onClick={() => void act({ type: 'finish' })}>Finish now</button>
        <button type="button" className="widget-action" disabled={pending} onClick={() => setConfirm('cancel')}>Cancel session</button>
        <button type="button" className="widget-action" disabled={pending} onClick={() => setConfirm('reset')}>Reset timer</button>
      </div> : <form className="focus-form" onSubmit={start} noValidate>
        <div className="focus-form-fields">
          <label>Session label<input value={label} maxLength={80} placeholder="Focus session" onChange={e => setLabel(e.target.value)} /></label>
          <label>Task (optional)<select value={tasks.some(task => task.id === taskId) ? taskId : ''}
            onChange={e => setTaskId(e.target.value)}>
            <option value="">No task</option>
            {tasks.map(task => <option key={task.id} value={task.id}>{task.category} · {task.name}</option>)}
          </select></label>
        </div>
        {taskError && <p role="status">Task choices could not be loaded. You can start without a task.</p>}
        {mode === 'countdown' && <fieldset><legend>Duration</legend>
          <div className="focus-presets">{presets.map(value => <button type="button" className="widget-action" key={value}
            aria-pressed={Number(duration) === value} onClick={() => { setDuration(String(value)); setInvalid(false); void dispatch({ type: 'set-duration', durationMs: value * minute }) }}>{value} min</button>)}</div>
          <label>Duration in minutes<input type="number" min={1} max={720} step={1} inputMode="numeric"
            aria-invalid={invalid} value={duration} onBlur={() => {
              const value = Number(duration)
              if (Number.isInteger(value) && validDuration(value * minute)) {
                void dispatch({ type: 'set-duration', durationMs: value * minute })
              }
            }} onChange={e => { setDuration(e.target.value); setInvalid(false) }} /></label>
        </fieldset>}
        {invalid && <p role="alert">Enter a whole number from 1 to 720 minutes.</p>}
        <div className="focus-actions">
          <button type="submit" className="widget-action focus-primary" disabled={pending}>Start session</button>
          {timer.status !== 'idle' && <button type="button" className="widget-action" disabled={pending}
            onClick={() => void act({ type: 'reset' })}>Clear timer</button>}
        </div>
      </form>}
      {active && confirm && <div className="focus-confirm">
        <p>{confirm === 'reset' ? 'Reset to idle and log this session as cancelled?' : 'End this session and log it as cancelled?'}</p>
        <button type="button" className="widget-action" disabled={pending}
          onClick={() => void act({ type: confirm })}>{confirm === 'reset' ? 'Confirm reset' : 'Confirm cancellation'}</button>
        <button type="button" className="widget-action" disabled={pending} onClick={() => setConfirm(undefined)}>Keep session</button>
      </div>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </dialog>
}
