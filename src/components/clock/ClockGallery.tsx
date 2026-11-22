import { Ornament } from '../../themes/Ornament'
import { useLayoutEffect, useRef } from 'react'
import { useDisplay } from '../../app/contexts'
import { useClock } from '../../hooks/useClock'
import { clockAccents, faces, type ClockDisplay, type FaceId } from './registry'
import './gallery.css'

const entries = Object.entries(faces) as [FaceId, (typeof faces)[FaceId]][]

function FacePreviews() {
  const now = useClock()
  const { prefs, update } = useDisplay()
  return <div className="face-grid">
    {entries.filter(([, face]) => face.themes.includes(prefs.theme)).map(([id, face]) =>
      <button key={id} type="button" className="face-option" aria-pressed={prefs.face === id}
        onClick={() => update({ face: id })}>
        <span className="face-preview" aria-hidden="true"><face.Component {...prefs.clock} now={now} /></span>
        <span>{face.name}</span>
      </button>)}
  </div>
}

export function ClockGallery({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { prefs, update } = useDisplay()
  const change = (patch: Partial<ClockDisplay>) => update({ clock: { ...prefs.clock, ...patch } })

  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return <dialog ref={dialog} className="clock-gallery theme-panel" data-page-swipe="off" aria-labelledby="gallery-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <Ornament />
    <header className="gallery-heading">
      <h2 id="gallery-title">Clock faces</h2>
      <button type="button" autoFocus onClick={close}>Close</button>
    </header>
    <div className="gallery-settings">
      <label>Time format <select value={prefs.clock.format}
        onChange={event => change({ format: event.target.value as ClockDisplay['format'] })}>
        <option value="device">Device</option><option value="12h">12-hour</option><option value="24h">24-hour</option>
      </select></label>
      <label><input type="checkbox" checked={prefs.clock.seconds}
        onChange={event => change({ seconds: event.target.checked })} /> Show seconds</label>
      {faces[prefs.face].supportsAccent && <label>Accent <select value={prefs.clock.accent}
        onChange={event => change({ accent: event.target.value as ClockDisplay['accent'] })}>
        {Object.entries(clockAccents).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>}
    </div>
    <div className="gallery-scroll" tabIndex={0} aria-label="Available clock faces"><FacePreviews /></div>
  </dialog>
}
