import { useEffect, useState } from 'react'
import { Disc3, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { Ornament } from '../../themes/Ornament'
import { usePhone, phoneAction } from '../../services/phoneLink'
import './spotify.css'

const pixelControl: Record<string, string> = {
  play: 'M4 2h3v2h3v2h3v2h-3v2H7v2H4z',
  pause: 'M4 2h3v10H4zm5 0h3v10H9z',
  previous: 'M1 2h2v10H1zm11 0h2v10h-2v-2H9V8H6V6h3V4h3z',
  next: 'M13 2h2v10h-2zM2 2h2v2h3v2h3v2H7v2H4v2H2z',
}

const descriptions: Record<string, string> = {
  disconnected: 'Sender disconnected',
  disabled: 'Spotify sharing is off',
  permission: 'Notification Access required on sender',
  absent: 'No active Spotify session',
  unavailable: 'Spotify session unavailable',
}
function time(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}
function Player({ compact }: { compact: boolean }) {
  const s = usePhone()
  const m = s.media
  const [now, setNow] = useState(Date.now)
  const [drag, setDrag] = useState<number>()
  const [error, setError] = useState('')
  const active = s.connected && m.status === 'active'
  const playing = active && m.playing
  useEffect(() => {
    if (!playing || compact) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [playing, compact])
  const duration = m.duration ?? 0
  const position = Math.max(
    0,
    Math.min(
      duration,
      (m.position ?? 0) + (playing ? Math.max(0, now - (m.updated ?? now)) * (m.speed ?? 1) : 0),
    ),
  )
  const actions = m.actions ?? 0
  const states: Record<number, string> = {
    1: 'Stopped',
    2: 'Paused',
    3: 'Playing',
    4: 'Fast-forwarding',
    5: 'Rewinding',
    6: 'Buffering',
    7: 'Playback error',
    8: 'Connecting',
    9: 'Skipping',
    10: 'Skipping',
    11: 'Skipping',
  }
  const status = active
    ? (states[m.state ?? 0] ?? 'Playback state unavailable')
    : (descriptions[m.status] ?? 'Metadata unavailable')
  async function command(action: string, pos?: number) {
    setError('')
    try {
      await phoneAction('command', action, pos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Control unavailable')
    }
  }
  return (
    <div className={compact ? 'spotify-player compact widget-content' : 'spotify-player'}>
      <div className="spotify-art theme-panel">
        {!compact && <Ornament />}
        {active && m.art?.startsWith('data:image/png;base64,') ? (
          <img src={m.art} alt="Album artwork" />
        ) : (
          <Disc3 aria-label="Artwork unavailable" />
        )}
      </div>
      <section className="spotify-details">
        <h2 className={compact ? 'widget-title' : undefined}>
          {active ? m.title || 'Track title unavailable' : 'Spotify'}
        </h2>
        {active && <p>{[m.artist, m.album].filter(Boolean).join(' · ') || 'Artist and album unavailable'}</p>}
        <small>
          {status}
          {s.connected && ' · ' + s.peerName}
        </small>
        {!compact && active && (
          <>
            <label className="spotify-progress">
              <span>{drag !== undefined || (m.position ?? -1) >= 0 ? time(drag ?? position) : '–:––'}</span>
              <input
                aria-label="Seek in track"
                type="range"
                min={0}
                max={duration || 1}
                value={drag ?? position}
                step={1000}
                disabled={!(actions & 256) || !duration || !!s.pending}
                onChange={(e) => setDrag(Number(e.target.value))}
                onPointerCancel={() => setDrag(undefined)}
                onBlur={() => setDrag(undefined)}
                onPointerUp={(e) => {
                  if (drag !== undefined) void command('seek', Number(e.currentTarget.value))
                  setDrag(undefined)
                }}
                onKeyUp={(e) => {
                  if (drag !== undefined) void command('seek', Number(e.currentTarget.value))
                  setDrag(undefined)
                }}
              />
              <span>{duration > 0 ? time(duration) : '–:––'}</span>
            </label>
            {m.remote && <small>Remote playback · controls depend on the sender session</small>}
          </>
        )}
        <div className="spotify-controls">
          {[
            { name: 'Previous', action: 'previous', bit: 16, Icon: SkipBack },
            {
              name: playing ? 'Pause' : 'Play',
              action: playing ? 'pause' : 'play',
              bit: (playing ? 2 : 4) | 512,
              Icon: playing ? Pause : Play,
            },
            { name: 'Next', action: 'next', bit: 32, Icon: SkipForward },
          ].map(({ name, action, bit, Icon }) => (
            <button
              className="widget-action"
              aria-label={name}
              title={actions & bit ? name : name + ' unavailable'}
              key={name}
              disabled={!active || !(actions & bit) || !!s.pending}
              onClick={() => void command(action)}
            >
              <Icon className="spotify-standard-icon" aria-hidden="true" />
              <svg
                className="spotify-pixel-icon"
                viewBox="0 0 16 14"
                shapeRendering="crispEdges"
                aria-hidden="true"
              >
                <path d={pixelControl[action]} fill="currentColor" />
              </svg>
            </button>
          ))}
        </div>
        {(error || s.pending || s.result) && (
          <small role="status">{error || (s.pending ? 'Sending command…' : s.result)}</small>
        )}
        {!compact && (
          <a href="https://open.spotify.com/" target="_blank" rel="noreferrer">
            Open Spotify ↗
          </a>
        )}
      </section>
    </div>
  )
}
export function MediaWidget() {
  return <Player compact />
}
export function Spotify() {
  return (
    <section className="workspace-page media-page">
      <Player compact={false} />
    </section>
  )
}
