import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { useQuery } from '../../hooks/useQuery'
import { onPause } from '../../services/lifecycle'
import { reminders } from '../../services/reminderScheduler'
import { minInterval, type ReminderDraft } from '../../services/reminders'
import { availableVoices, onVoiceListChange, startSpeech, type Voice } from '../../services/speech'
import { localDate } from '../../storage/calendar'
import { Ornament } from '../../themes/Ornament'
import type { Delivery, Reminder, ReminderSchedule } from '../../types/models'

function localInput(at: number) {
  if (!Number.isFinite(at)) return ''
  const date = new Date(at)
  return localDate(date) + 'T' + date.toTimeString().slice(0, 5)
}

function ReminderEditor({ row, close }: { row?: Reminder; close: () => void }) {
  const [message, setMessage] = useState(row?.message || row?.title || '')
  const [mode, setMode] = useState<ReminderSchedule['kind']>(row?.schedule?.kind ?? 'once')
  const [time, setTime] = useState(row?.schedule?.kind === 'daily' ? row.schedule.time : '20:00')
  const [once, setOnce] = useState(() => localInput(row?.scheduledAt ?? Date.now() + 3_600_000))
  const [interval, setInterval] = useState(row?.schedule?.kind === 'interval' ? String(row.schedule.minutes) : '60')
  const [voice, setVoice] = useState(row?.voice ?? '')
  const [rate, setRate] = useState(row?.rate ?? 1)
  const [volume, setVolume] = useState(row?.volume ?? 1)
  const [voices, setVoices] = useState<Voice[]>([])
  const [voiceInfo, setVoiceInfo] = useState('Checking installed voices…')
  const [error, setError] = useState('')
  const [sampleStatus, setSampleStatus] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const sample = useRef<ReturnType<typeof startSpeech> | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    const refresh = () => {
      void availableVoices().then(list => {
        if (!mounted) return
        setVoices(list)
        setVoiceInfo(list.length ? '' : 'No offline voices detected. Check your device’s text-to-speech settings.')
      }).catch((reason: Error) => { if (mounted) setVoiceInfo(reason.message) })
    }
    refresh()
    const unsubscribe = onVoiceListChange(refresh)
    const offPause = onPause(() => sample.current?.stop())
    return () => { mounted = false; unsubscribe(); offPause(); const job = sample.current; sample.current = undefined; job?.stop() }
  }, [])

  function testVoice() {
    if (sample.current) { sample.current.stop(); return }
    setSampleStatus('Testing…')
    setTesting(true)
    const job = startSpeech(message.trim() || 'This is your Standby voice.', { voice, rate, volume })
    sample.current = job
    void job.done.then(result => {
      if (sample.current !== job) return
      sample.current = undefined
      setTesting(false)
      setSampleStatus(result.status === 'spoken' ? 'Voice test complete.' : result.error || 'Voice test stopped.')
    })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSaving(true)
    const at = +new Date(once)
    const schedule: ReminderDraft['schedule'] = mode === 'daily' ? { kind: 'daily', time }
      : mode === 'interval' ? { kind: 'interval', minutes: Number(interval) }
      : { kind: 'once', at: localInput(at) === once ? at : NaN }
    try {
      await reminders.save({ message, schedule, voice, rate, volume }, row?.id)
      close()
    } catch (reason) { setError((reason as Error).message); setSaving(false) }
  }

  return <Modal title={row ? 'Edit voice reminder' : 'New voice reminder'} close={() => { if (!saving) close() }}>
    <form className="voice-form" onSubmit={event => void save(event)}>
      <label className="voice-wide">Spoken message
        <textarea autoFocus required maxLength={500} rows={2} value={message} onChange={event => setMessage(event.target.value)} />
      </label>
      <label><span id="voice-schedule-label">Schedule</span>
        <select aria-labelledby="voice-schedule-label" value={mode} onChange={event => setMode(event.target.value as ReminderSchedule['kind'])}>
          <option value="once">One time</option><option value="daily">Daily</option><option value="interval">Repeating interval</option>
        </select>
      </label>
      {mode === 'once' && <label>Date and time<input required type="datetime-local" value={once} onChange={e => setOnce(e.target.value)} /></label>}
      {mode === 'daily' && <label>Local time<input required type="time" value={time} onChange={e => setTime(e.target.value)} /></label>}
      {mode === 'interval' && <label>Interval in minutes<input required type="number" min={minInterval} max={525600} value={interval}
        onChange={e => setInterval(e.target.value)} /></label>}
      <label className="voice-wide"><span id="voice-choice-label">Voice</span>
        <select aria-labelledby="voice-choice-label" value={voice} onChange={event => setVoice(event.target.value)}>
          <option value="">Device offline voice</option>
          {voice && !voices.some(item => item.id === voice) && <option value={voice}>Previously selected voice (unavailable)</option>}
          {voices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {voiceInfo && <p className="voice-wide">{voiceInfo}</p>}
      <label>Speech rate · {rate}×
        <input type="range" min=".5" max="2" step=".1" value={rate} onChange={e => setRate(Number(e.target.value))} />
      </label>
      <label>Volume · {Math.round(volume * 100)}%
        <input type="range" min="0" max="1" step=".1" value={volume} onChange={e => setVolume(Number(e.target.value))} />
      </label>
      {error && <p className="voice-wide" role="alert">{error}</p>}
      {sampleStatus && <p className="voice-wide" role="status">{sampleStatus}</p>}
      <footer className="page-actions voice-wide">
        <button type="button" className="widget-action" onClick={testVoice}>{testing ? 'Stop test' : 'Test Voice'}</button>
        <button className="widget-action primary" disabled={saving}>Save reminder</button>
      </footer>
    </form>
  </Modal>
}

const renderTime = (at: number) => Number.isFinite(at) ? new Date(at).toLocaleString() : 'Unavailable'
const statuses: Record<Delivery['status'], string> = {
  pending: 'Delivery unconfirmed', unconfirmed: 'Delivery unconfirmed', spoken: 'Spoken', silenced: 'Silenced',
  skipped: 'Skipped', error: 'Speech failed',
}

export function VoiceReminders() {
  const { data: rows, error: loadError } = useQuery(reminders.list)
  const { data: history, error: historyError } = useQuery(reminders.history)
  const [edit, setEdit] = useState<Reminder | 'new'>()
  const [problem, setProblem] = useState('')
  async function run(operation: () => Promise<unknown>) {
    setProblem('')
    try { await operation() } catch (reason) { setProblem((reason as Error).message) }
  }
  return <section className="workspace-panel theme-panel voice-reminders" aria-labelledby="voice-reminders-heading">
    <Ornament />
    <header className="page-heading"><h2 id="voice-reminders-heading">Voice Reminders</h2>
      <button className="widget-action primary" onClick={() => setEdit('new')}>Add reminder</button></header>
    <p>Announcements play while Standby is active. Occurrences more than one minute late are skipped.</p>
    {(problem || loadError || historyError) && <p role="alert">{problem || loadError || historyError}</p>}
    {rows?.length === 0 && <p>No reminders yet.</p>}
    <ul className="voice-list">{rows?.map(row => <li key={row.id}>
      <div className="voice-copy">
        <strong>{row.message || row.title}</strong>
        <small>{row.schedule?.kind === 'daily' ? 'Daily at ' + row.schedule.time
          : row.schedule?.kind === 'interval' ? 'Every ' + row.schedule.minutes + ' min' : 'One time'}</small>
        <small>{row.enabled ? 'Next · ' + renderTime(row.scheduledAt) : 'Inactive'}</small>
      </div>
      <div className="page-actions">
        <button className="widget-action" onClick={() => setEdit(row)}>Edit</button>
        <button className="widget-action" onClick={() => void run(() => reminders.setEnabled(row.id, !row.enabled))}>
          {row.enabled ? 'Disable' : 'Enable'}
        </button>
        <button className="widget-action" onClick={() => {
          if (window.confirm('Delete this reminder?')) void run(() => reminders.remove(row.id))
        }}>Delete</button>
      </div>
    </li>)}</ul>
    <details className="voice-history">
      <summary>Recent delivery history</summary>
      {history?.length ? <>
        <ul>{history.map(item => <li key={item.id}>
          <strong>{item.message || rows?.find(row => row.id === item.reminderId)?.title || 'Reminder'}</strong>
          <small>{statuses[item.status]} · Scheduled {renderTime(item.scheduledAt)}</small>
          {item.triggeredAt !== undefined && <small>Triggered {renderTime(item.triggeredAt)}</small>}
          {item.error && <small>{item.error}</small>}
        </li>)}</ul>
        <button className="widget-action" onClick={() => {
          if (window.confirm('Clear completed and old delivery history?')) void run(reminders.clearHistory)
        }}>Clear history</button>
      </> : <p>No delivery records.</p>}
    </details>
    {edit && <ReminderEditor row={edit === 'new' ? undefined : edit} close={() => setEdit(undefined)} />}
  </section>
}
