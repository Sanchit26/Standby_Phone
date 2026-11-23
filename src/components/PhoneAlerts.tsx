import { useEffect, useState } from 'react'
import { Bell, PhoneIncoming } from 'lucide-react'
import { Modal } from './Modal'
import { ReminderOverlay } from './ReminderOverlay'
import { phoneAction, usePhone, type RemoteNote } from '../services/phoneLink'
import './phoneAlerts.css'

function NoteIcon({ row }: { row: RemoteNote }) {
  return row.icon?.startsWith('data:image/png;base64,') ? (
    <img src={row.icon} alt="" width="24" height="24" />
  ) : (
    <span className="remote-note-symbol" aria-hidden="true">
      <Bell />
      <svg className="pixel-bell" viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor">
        <path d="M7 1h2v2h2v1h1v2h1v4h1v1h1v2H1v-2h1v-1h1V6h1V4h1V3h2zm0 4H5v5H4v1h8v-1h-1V6H9V5zm-1 9h4v1H9v1H7v-1H6z" />
      </svg>
    </span>
  )
}
export function NotificationWidget({ expanded }: { expanded: boolean }) {
  const s = usePhone()
  return (
    <section className="widget-content remote-inbox">
      {!expanded && <h2 className="widget-title">Notifications</h2>}
      <p>
        {s.connected ? s.peerName : 'Sender disconnected'} · {s.rows.length} recent
      </p>
      {s.connected && s.rows.length === 0 && <p>No recent notifications.</p>}
      {(expanded ? s.rows : s.rows.slice(0, 1)).map((row) => (
        <article key={row.id}>
          <NoteIcon row={row} />
          <div>
            <strong>{row.app}</strong>{' '}
            <small>{new Date(row.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
            <p>{row.title}</p>
            {expanded && row.text && <p>{row.text}</p>}
          </div>
        </article>
      ))}
      {expanded && s.rows.length > 0 && (
        <button className="widget-action" onClick={() => void phoneAction('clear')}>
          Clear local inbox
        </button>
      )}
    </section>
  )
}
function Banner({ row }: { row: RemoteNote }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4500)
    return () => clearTimeout(timer)
  }, [])
  return (
    visible && (
      <aside role="status" className="remote-banner">
        <NoteIcon row={row} />
        <div>
          <strong>{row.app}</strong>
          <p>{row.title}</p>
        </div>
      </aside>
    )
  )
}
export function ReceiverOverlays() {
  const s = usePhone()
  const [dismissed, setDismissed] = useState('')
  const showCall = !!s.callId && s.callId !== dismissed
  const [displayed, setDisplayed] = useState<{ id: string; label: string; peer: string; source: string }>()
  if (
    showCall &&
    (displayed?.id !== s.callId ||
      displayed.label !== s.call ||
      displayed.peer !== s.peerName ||
      displayed.source !== s.callSource)
  ) {
    setDisplayed({ id: s.callId, label: s.call, peer: s.peerName, source: s.callSource })
  }
  const closing =
    !!displayed && !showCall && s.connected && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (showCall || !displayed) return
    const timer = window.setTimeout(() => setDisplayed(undefined), closing ? 140 : 0)
    return () => clearTimeout(timer)
  }, [showCall, displayed, closing])
  const visible = showCall || closing
  return (
    <>
      <ReminderOverlay covered={visible} />
      {visible && displayed && (
        <Modal title="Incoming Call" close={() => setDismissed(displayed.id)}>
          <div className="remote-call" data-closing={closing}>
            <PhoneIncoming className="call-minimal-icon" aria-hidden="true" />
            <svg
              className="call-fantasy-icon"
              viewBox="0 0 32 32"
              aria-hidden="true"
              shapeRendering="crispEdges"
            >
              <path
                fill="currentColor"
                d="M4 5h7v3h2v5h-3v2h2v3h3v2h3v-3h5v2h3v7h-3v2h-5v-2h-5v-3h-3v-3H7v-3H4v-5H2V7h2z"
              />
              <path fill="none" stroke="currentColor" strokeWidth="2" d="M19 8h4v4h2v3m-5-12h6v3h3v6" />
            </svg>
            <strong>{displayed.label === 'Incoming Call' ? 'Unknown caller' : displayed.label}</strong>
            <p>
              {displayed.source && displayed.source + ' · '}Ringing on {displayed.peer}
            </p>
          </div>
        </Modal>
      )}
      {!visible && s.connected && s.banners && s.banner && s.rows[0] && (
        <Banner key={s.banner} row={s.rows[0]} />
      )}
    </>
  )
}
