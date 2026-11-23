import { useEffect, useState } from 'react'
import { nativePhone, phoneAction, phoneLink, usePhone } from '../../services/phoneLink'
import { Ornament } from '../../themes/Ornament'
import './phoneConnection.css'

export function PhoneConnection() {
  const s = usePhone()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [installed, setInstalled] = useState<{ pkg: string; name: string }[]>([])
  const sender = s.role === 'sender'
  useEffect(() => {
    let active = true
    if (sender && nativePhone)
      void phoneLink
        .applications()
        .then((r) => {
          if (active) setInstalled(r.apps.sort((a, b) => a.name.localeCompare(b.name)))
        })
        .catch(() => {
          if (active) setError('App list unavailable')
        })
    return () => {
      active = false
    }
  }, [sender])
  async function act(key: string, value = '') {
    setError('')
    setBusy(true)
    try {
      await phoneAction(key, value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action unavailable')
    } finally {
      setBusy(false)
    }
  }
  const toggle = (key: 'calls' | 'music' | 'previews' | 'banners', label: string) => (
    <label className="settings-switch">
      <input
        type="checkbox"
        checked={s[key]}
        disabled={busy || (s.running && key !== 'banners')}
        onChange={(e) => void act(key, String(e.target.checked))}
      />
      {label}
    </label>
  )
  return (
    <section className="workspace-panel theme-panel settings-panel phone-settings">
      <Ornament />
      <h2>Phone Connection</h2>
      {!nativePhone ? (
        <p>Available in the Android app.</p>
      ) : (
        <>
          <label>
            Device mode{' '}
            <select
              value={s.role}
              disabled={busy || s.running || s.paired}
              onChange={(e) => void act('role', e.target.value)}
            >
              <option value="receiver">Dashboard receiver</option>
              <option value="sender">Phone sender</option>
            </select>
          </label>
          <label>
            Device name{' '}
            <input
              key={s.name}
              defaultValue={s.name}
              maxLength={48}
              disabled={s.running}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value.trim() !== s.name)
                  void act('name', e.target.value)
              }}
            />
          </label>
          <p role="status">
            {s.status}
            {s.paired && ' · ' + s.peerName}
            {s.address && ' · ' + s.address}
          </p>
          {sender ? (
            <>
              <p>
                Choose the apps and information to share over home Wi-Fi. Start Sharing keeps a visible
                Android service active while the screen is locked.
              </p>
              <button className="widget-action" onClick={() => void act('notificationAccess')}>
                Notification Access · {s.access ? 'enabled' : 'open settings'}
              </button>
              <p>
                Notification Access lets Standby read selected app alerts and control the active Spotify
                session.
              </p>
              <details>
                <summary>Apps to mirror ({s.apps.length})</summary>
                {installed.map((app) => (
                  <label className="settings-switch" key={app.pkg}>
                    <input
                      type="checkbox"
                      disabled={s.running || busy}
                      checked={s.apps.includes(app.pkg)}
                      onChange={() => void act('apps', app.pkg)}
                    />
                    {app.name} <small>{app.pkg}</small>
                  </label>
                ))}
              </details>
              {toggle('previews', 'Share eligible public titles and previews')}
              {toggle('music', 'Share Spotify and allow playback controls')}
              {toggle('calls', 'Share incoming-call alerts')}
              {s.calls && (
                <button className="widget-action" onClick={() => void act('phonePermission')}>
                  Phone state · {s.phonePermission ? 'allowed' : 'grant for mobile calls'}
                </button>
              )}
              <label>
                Receiver IPv4 address (optional){' '}
                <input
                  key={s.host}
                  defaultValue={s.host}
                  disabled={s.running}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== s.host) void act('host', e.target.value)
                  }}
                />
              </label>
              {!s.paired && (
                <label>
                  Receiver pairing code{' '}
                  <input
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <p>
                Start the receiver on your home Wi-Fi. Enter its code on the sender, then approve the device
                here.
              </p>
              {s.code && <output className="phone-code">{s.code}</output>}
              {s.candidate && (
                <button className="widget-action primary" onClick={() => void act('approve', s.candidate)}>
                  Approve sender
                </button>
              )}
              {toggle('banners', 'Show notification banners')}
              <label>
                Inbox retention{' '}
                <select value={s.minutes} onChange={(e) => void act('minutes', e.target.value)}>
                  {[5, 15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="phone-buttons">
            <button
              className="widget-action primary"
              disabled={busy || (sender && !s.paired && !code.trim())}
              onClick={() => void act('start', code)}
            >
              {s.running
                ? s.paired
                  ? 'Reconnect'
                  : 'Restart pairing'
                : sender
                  ? 'Start sharing'
                  : 'Start receiver'}
            </button>
            {s.running && (
              <button className="widget-action" onClick={() => void act('stop')}>
                {sender ? 'Stop sharing' : 'Stop receiver'}
              </button>
            )}
            {s.paired && (
              <button
                className="widget-action"
                onClick={() => {
                  if (window.confirm('Remove the paired phone and stop this connection?')) {
                    setCode('')
                    void act('unpair')
                  }
                }}
              >
                Unpair
              </button>
            )}
          </div>
          <details>
            <summary>Android service settings</summary>
            <button className="widget-action" onClick={() => void act('notificationPermission')}>
              Allow service notifications
            </button>
            <button className="widget-action" onClick={() => void act('battery')}>
              Open app battery settings
            </button>
          </details>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  )
}
export function SenderSetup() {
  return (
    <div className="app-shell">
      <main className="app-viewport">
        <div className="workspace-page settings-page">
          <header className="page-heading">
            <h1>Phone sharing</h1>
          </header>
          <PhoneConnection />
        </div>
      </main>
    </div>
  )
}
