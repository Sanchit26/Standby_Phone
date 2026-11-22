import { Disc3, Play, SkipBack, SkipForward } from 'lucide-react'
import { Ornament } from '../../themes/Ornament'
import './spotify.css'

interface MediaSource {
  track?: { title: string; artist: string; artwork?: string }
  previous?: () => void
  play?: () => void
  next?: () => void
}
const disconnected: MediaSource = {}
export function MediaWidget() {
  const source = disconnected
  return <section className="widget-content playback">
    <div className="record-sleeve">{source.track?.artwork ? <img src={source.track.artwork} alt="Album artwork"/> : <Disc3 aria-hidden="true"/>}</div>
    <div><h2 className="widget-title">{source.track?.title ?? 'Spotify'}</h2><p>{source.track?.artist ?? 'No playback source connected.'}</p>
      <div className="playback-actions">{[
        { Icon: SkipBack, label: 'Previous', action: source.previous }, { Icon: Play, label: 'Play', action: source.play },
        { Icon: SkipForward, label: 'Next', action: source.next },
      ].map(({ Icon, label, action }) => {
        return <button key={label} className="widget-action" aria-label={label} disabled={!action} onClick={action}><Icon /></button>
      })}</div>
      <a className="widget-action primary" href="https://open.spotify.com/" target="_blank" rel="noreferrer">Open Spotify ↗</a>
    </div>
  </section>
}
export function Spotify() {
  return <section className="workspace-page media-page">
    <div className="workspace-panel theme-panel">
      <Ornament /><MediaWidget />
      <p>Playback controls require a connected media session. Open Spotify to listen.</p>
    </div>
  </section>
}
