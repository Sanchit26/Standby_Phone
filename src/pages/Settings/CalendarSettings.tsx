import { useState } from 'react'
import { useDisplay } from '../../app/contexts'
import { useDeviceCalendarStatus } from '../../hooks/useDeviceCalendar'
import { deviceCalendar, deviceCalendarAvailable } from '../../services/deviceCalendar'
import { Ornament } from '../../themes/Ornament'

export function CalendarSettings() {
  const { prefs, update } = useDisplay()
  const { enabled, ids } = prefs.deviceCalendar
  const status = useDeviceCalendarStatus()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function perform(action: () => Promise<unknown>) {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  const request = () => perform(async () => {
    setFailed(await deviceCalendar.requestAccess() === 'unavailable')
  })
  return <section className="settings-panel workspace-panel theme-panel" aria-labelledby="calendar-sync">
    <Ornament />
    <h2 id="calendar-sync">Calendar Synchronization</h2>
    {deviceCalendarAvailable ? <>
      <p>Standby reads selected calendars from Android. Allow Calendar access after turning on device events.</p>
      <label className="settings-switch">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={event => {
          const next = event.target.checked
          update({ deviceCalendar: { enabled: next, ids } })
          if (next) void request()
        }}/> Show device calendar events
      </label>
      {enabled && <>
        {status.access === 'checking' && <p role="status">Checking calendar access…</p>}
        {status.access === 'denied' && <p>Calendar access is blocked. Allow it under Permissions in Android App Settings.</p>}
        {status.access === 'prompt-with-rationale' && <p>Calendar access was declined. You can grant read access when ready.</p>}
        {(status.access === 'prompt' || status.access === 'prompt-with-rationale' || status.access === 'denied') &&
          <button className="widget-action" disabled={busy} onClick={() => void request()}>
            {status.access === 'denied' ? 'Open Android App Settings' : 'Allow calendar access'}
          </button>}
        {status.access === 'granted' && (status.calendars.length ? <fieldset className="calendar-options">
          <legend>Calendars to display</legend>
          {status.calendars.map(calendar => <label key={calendar.id} className="settings-switch">
            <input type="checkbox" checked={ids.includes(calendar.id)} onChange={event => update({
              deviceCalendar: { enabled, ids: event.target.checked ? [...ids, calendar.id] : ids.filter(id => id !== calendar.id) },
            })}/>
            <span>{calendar.name} <small>· {calendar.id}</small></span>
          </label>)}
        </fieldset> : <p>No readable, visible calendars are available on this device.</p>)}
        {status.access === 'granted' && status.calendars.length > 0 && !ids.some(id => status.calendars.some(row => row.id === id)) &&
          <p>Select a calendar to show its events.</p>}
        {(status.error || failed) && <p role="alert">{status.error || 'Could not open Android calendar access.'}</p>}
        <div className="page-actions settings-refresh">
          <button className="widget-action" disabled={busy} onClick={() => void perform(() => deviceCalendar.refresh())}>Refresh</button>
          {status.refreshedAt !== undefined && <small>Last read {new Date(status.refreshedAt).toLocaleString()}</small>}
        </div>
      </>}
    </> : <p>Device calendar access is available in the Android app. Local Standby events work here.</p>}
  </section>
}
