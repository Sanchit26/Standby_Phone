import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useClock } from '../../hooks/useClock'
import { useQuery } from '../../hooks/useQuery'
import { db } from '../../storage/database'
import { dayEvents, localDate, saveEvent } from '../../storage/calendar'
import { Ornament } from '../../themes/Ornament'
import { Modal } from '../../components/Modal'
import type { CalendarEvent } from '../../types/models'
import './calendar.css'

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const blank = (day: string) => ({ day, title: '', description: '', allDay: true, start: '', end: '', color: '' })
function useEvents(day: string) {
  return useQuery(useCallback(() => dayEvents(db, day), [day]))
}
export function TodayEvents({ compact = false }: { compact?: boolean }) {
  const today = localDate(useClock(1000))
  const { data, error } = useEvents(today)
  if (compact && !data?.length) return null
  const first = data?.[0]
  return <Link className={compact ? 'event-strip' : 'event-preview'} to="/calendar">
    {first ? 'Today · ' + (first.start ? first.start + ' ' : '') + first.title + (data!.length > 1 ? ' · +' + (data!.length - 1) : '')
      : error || 'No events today'}</Link>
}

function EventEditor({ day, event, saved, close }: { day: string; event?: CalendarEvent; saved: (day: string) => void; close: () => void }) {
  const [draft, set] = useState(event ?? blank(day))
  const [error, fail] = useState('')
  const [busy, pending] = useState(false)
  const field = (key: 'title' | 'description' | 'day' | 'start' | 'end' | 'color', value: string) => set({ ...draft, [key]: value })
  return <Modal title={event ? 'Edit event' : 'New event'} close={close}><form className="entry-form" onSubmit={async e => {
    e.preventDefault()
    pending(true)
    try { await saveEvent(db, draft, event?.id); saved(draft.day) }
    catch (err) { fail(err instanceof Error ? err.message : 'Unable to save event.'); pending(false) }
  }}>
    <label>Title<input autoFocus required value={draft.title} onChange={e => field('title', e.target.value)} /></label>
    <label>Date<input required type="date" value={draft.day} onChange={e => field('day', e.target.value)} /></label>
    <label>Description<textarea value={draft.description} onChange={e => field('description', e.target.value)} /></label>
    <label>Color<select value={draft.color} onChange={e => field('color', e.target.value)}>
      {['', 'coral', 'gold', 'skyblue', 'plum'].map(c => <option key={c} value={c}>{c || 'Theme default'}</option>)}</select></label>
    <label><input type="checkbox" checked={draft.allDay} onChange={e => set({ ...draft, allDay: e.target.checked })}/> All day</label>
    {!draft.allDay && <div className="form-row">{(['start','end'] as const).map(k => <label key={k}>{k === 'start' ? 'Start time' : 'End time'}
      <input type="time" value={draft[k]} onChange={e => field(k, e.target.value)} /></label>)}</div>}
    {error && <p role="alert">{error}</p>}<footer><button className="widget-action primary" disabled={busy}>Save event</button></footer>
  </form></Modal>
}
export function Calendar() {
  const today = localDate(useClock(1000))
  const [chosen, choose] = useState<string>()
  const day = chosen ?? today
  const date = new Date(day + 'T12:00:00')
  const month = date.getMonth(), year = date.getFullYear()
  const first = new Date(year, month, 1)
  const days = new Date(year, month + 1, 0).getDate()
  const { data: events, error } = useEvents(day)
  const monthStart = localDate(first), monthEnd = localDate(new Date(year, month + 1, 1))
  const marks = useQuery(useCallback(() => db.events.where('day').between(monthStart, monthEnd).uniqueKeys(), [monthStart, monthEnd]))
  const [edit, setEdit] = useState<CalendarEvent | 'new'>()
  const [problem, fail] = useState('')
  return <section className="workspace-page calendar-page">
    <header className="page-heading">
      <h1>Calendar</h1>
      <button className="widget-action" onClick={() => choose(undefined)}>Today</button>
    </header>
    <div className="calendar-spread">
      <section className="workspace-panel theme-panel">
        <Ornament />
        <header className="page-heading month-heading">
          <button className="widget-action" aria-label="Previous month" onClick={() => choose(localDate(new Date(year, month - 1, 1)))}>‹</button>
          <h2>{date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <button className="widget-action" aria-label="Next month" onClick={() => choose(localDate(new Date(year, month + 1, 1)))}>›</button>
        </header>
        <div className="month-grid">
          {Array.from({ length: 7 }, (_, i) => <small key={'w'+i}>{weekday.format(new Date(2024, 0, 1 + i))}</small>)}
          {Array.from({ length: (first.getDay() + 6) % 7 }, (_, i) => <span key={'b'+i} />)}
          {Array.from({ length: days }, (_, i) => {
            const key = localDate(new Date(year, month, i + 1))
            return <button key={key} aria-label={key} aria-pressed={key === day} aria-current={key === today ? 'date' : undefined}
              data-event={marks.data?.includes(key)} onClick={() => choose(key)}>{i + 1}</button>
          })}
        </div>
      </section>
      <section className="calendar-agenda workspace-panel theme-panel">
        <Ornament />
        <header className="page-heading">
          <h2>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</h2>
          <button className="widget-action primary" onClick={() => setEdit('new')}>Add event</button>
        </header>
        <div className="agenda-list">
          {(error || problem) && <p role="alert">{error || problem}</p>}
          {events && !events.length && <p>No events scheduled.</p>}
          {events?.map(item => <article key={item.id} className="agenda-item" style={{ borderColor: item.color || undefined }}>
            <strong>{item.title}</strong>
            <small>{item.allDay ? 'All day' : [item.start, item.end].filter(Boolean).join(' – ') || 'Time unspecified'}</small>
            {item.description && <p>{item.description}</p>}
            <div className="page-actions">
              <button className="widget-action" onClick={() => setEdit(item)}>Edit</button>
              <button className="widget-action" onClick={async () => {
                if (window.confirm('Delete this event?')) try { await db.events.delete(item.id) } catch { fail('Unable to delete event.') }
              }}>Delete</button>
            </div>
          </article>)}
        </div>
      </section>
    </div>
    {edit && <EventEditor day={day} event={edit === 'new' ? undefined : edit} close={() => setEdit(undefined)}
      saved={d => { choose(d); setEdit(undefined) }}/>}
  </section>
}
