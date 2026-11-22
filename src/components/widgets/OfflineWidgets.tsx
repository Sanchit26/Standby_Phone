import { useEffect, useMemo, useState } from 'react'
import type { Observable } from 'dexie'
import { TodayEvents } from '../../pages/Calendar/Calendar'
import { useDisplay, useTimer } from '../../app/contexts'
import { formatDuration } from '../timer/format'
import { Countdown, TimerProgress } from '../timer/Countdown'
import { useClock } from '../../hooks/useClock'
import { observeFocusHistory } from '../../storage/widgetStats'
import { observeTasks } from '../../storage/taskQueries'
import { quotes } from './quotes'

function useWidgetData<T>(observe: () => Observable<T>) {
  const [state, setState] = useState<{ data?: T; failed?: boolean }>({})
  useEffect(() => {
    const subscription = observe().subscribe({
      next: data => setState({ data }),
      error: () => setState({ failed: true }),
    })
    return () => subscription.unsubscribe()
  }, [observe])
  return state
}

export function ProgressWidget() {
  const { data, failed } = useWidgetData(observeTasks)
  const { prefs } = useDisplay()
  const active = data?.categories.find(group => group.id === prefs.taskCategory)
  const count = active?.progress
  return <section className="widget-content">
    <h2 className="widget-title">{active?.name ?? 'List progress'}</h2>
    {failed ? <p>Progress could not be loaded.</p> : !data ? <p>Loading progress…</p> : !active || !count
      ? <p>Choose a list in Quest Hub and tap Start Task.</p> : !count.total ? <p>This list has no tasks yet.</p> : <>
        <div className="widget-stat"><strong>{Math.round(count.percent)}%</strong><span>{count.done} of {count.total} complete</span></div>
        <progress className="widget-progress task-progress" aria-label={active.name} value={count.done} max={count.total} />
      </>}
  </section>
}

export function CalendarWidget() {
  const now = useClock(30_000)
  const year = now.getFullYear()
  const month = now.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  return <section className="widget-content calendar-widget">
    <header>
      <h2 className="widget-title">{now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <time dateTime={now.toISOString()}>{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</time>
    </header>
    <TodayEvents />
    <div className="calendar-grid">
      {Array.from({ length: 7 }, (_, index) => {
        const date = new Date(2024, 0, 1 + index)
        return <span key={index} className="calendar-weekday" title={date.toLocaleDateString(undefined, { weekday: 'long' })}>
          {date.toLocaleDateString(undefined, { weekday: 'short' })}
        </span>
      })}
      {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {Array.from({ length: days }, (_, index) => <span key={index}
        aria-current={index + 1 === now.getDate() ? 'date' : undefined}>{index + 1}</span>)}
    </div>
  </section>
}

const timerLabels = { idle: 'Idle', running: 'Running', paused: 'Paused', completed: 'Complete', cancelled: 'Cancelled' }

export function FocusWidget({ expanded }: { expanded: boolean }) {
  const { timer } = useTimer()
  const day = useClock(30_000)
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const observe = useMemo(() => () => observeFocusHistory(dayStart), [dayStart])
  const { data, failed } = useWidgetData(observe)

  return <section className="widget-content focus-widget">
    <h2 className="widget-title">Focus summary</h2>
    <div className="focus-state">{timerLabels[timer.status]}</div>
    <Countdown />
    <TimerProgress />
    {failed && <p>Focus history could not be loaded.</p>}
    {!failed && !data && <p>Loading history…</p>}
    {data && <p className="focus-today">Today · {data.today.count} completed · {formatDuration(data.today.duration)} focused</p>}
    {data && <div className="focus-history">
      <h3>Recent sessions</h3>
      {!data.recent.length ? <span>No sessions recorded yet.</span> : <ul>
        {(expanded ? data.recent : data.recent.slice(0, 1)).map(session => <li key={session.id}>
          <strong>{session.label ?? 'Focus session'}</strong>
          <span>{session.status === 'cancelled' ? 'Cancelled' : 'Completed'} · {
            formatDuration(session.elapsedMs ?? Math.max(0, (session.endedAt ?? 0) - session.startedAt))} focused</span>
          {expanded && <span>{new Date(session.endedAt ?? session.startedAt).toLocaleString()} · {
            session.mode === 'stopwatch' ? 'Stopwatch' : session.plannedMs === undefined ? 'Planned duration unavailable' : formatDuration(session.plannedMs) + ' planned'}
            {session.taskId && (' · ' + (session.taskTitle ?? 'Task unavailable'))}</span>}
        </li>)}
      </ul>}
    </div>}
  </section>
}

export function QuoteWidget() {
  const { prefs, update } = useDisplay()
  const quote = quotes[prefs.quoteIndex]
  return <section className="widget-content quote-widget">
    <h2 className="widget-title">Quote</h2>
    <blockquote><p>“{quote.text}”</p>{quote.author && <footer>{quote.author}</footer>}</blockquote>
    <button type="button" className="widget-action"
      onClick={() => update({ quoteIndex: (prefs.quoteIndex + 1) % quotes.length })}>Next quote</button>
  </section>
}
