import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Ornament } from '../../themes/Ornament'
import { useDisplay, useTimer } from '../../app/contexts'
import { clockAccents, faces, type ClockDisplay, type FaceId } from '../../components/clock/registry'
import { minute } from '../../components/timer/model'
import { themes, type ThemeId } from '../../themes/types'
import { createBackup } from '../../storage/backup'
import { db } from '../../storage/database'
import { saveBackup } from '../../services/backupDownload'
import { CalendarSettings } from './CalendarSettings'
import { VoiceReminders } from './VoiceReminders'
import './settings.css'
import './voiceReminders.css'

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="workspace-panel settings-panel theme-panel">
    <Ornament /><h2>{title}</h2>{children}
  </section>
}

function BackupSettings() {
  const { prefs } = useDisplay()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function download() {
    setMessage('')
    setBusy(true)
    try {
      const backup = await createBackup(db, prefs)
      const saved = await saveBackup('standby-backup-' + backup.exportedAt.slice(0, 10) + '.json', JSON.stringify(backup, null, 2))
      setMessage(saved ? 'Backup export prepared.' : 'Export cancelled.')
    } catch { setMessage('Could not export a backup.') }
    finally { setBusy(false) }
  }
  return <Panel title="Storage and Backup">
    <p>Export tasks, local events, focus history, reminders and display settings as JSON. Media and device calendar events stay on this device. Restore is unavailable.</p>
    <button className="widget-action" onClick={() => void download()} disabled={busy}>Export backup</button>
    {message && <p role="status">{message}</p>}
  </Panel>
}

export function Settings() {
  const { prefs, update } = useDisplay()
  const { timer, lastDuration } = useTimer()
  const face = faces[prefs.face]
  const clock = (patch: Partial<ClockDisplay>) => update({ clock: { ...prefs.clock, ...patch } })
  return <section className="workspace-page settings-page">
    <header className="page-heading"><h1>Settings</h1></header>
    <Panel title="Appearance">
      <label className="settings-row">Theme
        <select aria-label="Theme" value={prefs.theme} onChange={e => update({ theme: e.target.value as ThemeId })}>
          {Object.entries(themes).map(([id, theme]) => <option key={id} value={id}>{theme.name}</option>)}
        </select>
      </label>
    </Panel>
    <Panel title="Clock and Display">
      <label className="settings-row">Clock face
        <select aria-label="Clock face" value={prefs.face} onChange={e => update({ face: e.target.value as FaceId })}>
          {Object.entries(faces).filter(([, option]) => option.themes.some(theme => theme === prefs.theme))
            .map(([id, option]) => <option key={id} value={id}>{option.name}</option>)}
        </select>
      </label>
      <label className="settings-row">Time format
        <select aria-label="Time format" value={prefs.clock.format} onChange={e => clock({ format: e.target.value as ClockDisplay['format'] })}>
          <option value="device">Device setting</option><option value="12h">12-hour</option><option value="24h">24-hour</option>
        </select>
      </label>
      <label className="settings-row">Clock accent
        <select aria-label="Clock accent" value={prefs.clock.accent} disabled={!face.supportsAccent}
          onChange={e => clock({ accent: e.target.value as ClockDisplay['accent'] })}>
          {Object.entries(clockAccents).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <label className="settings-switch"><input type="checkbox" checked={prefs.clock.seconds}
        onChange={e => clock({ seconds: e.target.checked })}/> Show seconds</label>
      {!face.supportsAccent && <p>This face uses its own colors.</p>}
      <Link className="widget-action" to="/?clock=faces" state={{ openedClockGallery: true }}>Open clock gallery</Link>
    </Panel>
    <Panel title="Timer and Focus">
      <p>{timer.mode === 'stopwatch' ? 'Stopwatch selected' : 'Countdown selected'} · Countdown duration {lastDuration / minute} min</p>
      <Link className="widget-action" to="/?timer=controls" state={{ openedTimer: true }}>Open timer controls</Link>
    </Panel>
    <CalendarSettings />
    <VoiceReminders />
    <Panel title="Sanctuary and Media">
      <p>Manage imports, ordering, the default item and playback in Sanctuary’s library.</p>
      <Link className="widget-action" to="/sanctuary?library=1" state={{ openedLibrary: true }}>Open Sanctuary library</Link>
    </Panel>
    <BackupSettings />
    <Panel title="About Standby"><p>Offline-first productivity dashboard for landscape Android displays.</p></Panel>
  </section>
}
