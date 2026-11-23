import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDisplay } from '../../app/contexts'
import { quotes } from '../../components/widgets/quotes'
import { Modal } from '../../components/Modal'
import { useClock } from '../../hooks/useClock'
import { useQuery } from '../../hooks/useQuery'
import { useWidgetGestures } from '../../hooks/useWidgetGestures'
import { onPause, onResume } from '../../services/lifecycle'
import { importMedia, library, loadMedia, mediaKind, preferred, removeMedia, reorderMedia, resolveMedia, selectMedia, selection, setDefault, validateMedia } from '../../storage/media'
import type { MediaItem } from '../../types/models'
import './sanctuary.css'

function MiniClock() {
  const { prefs } = useDisplay()
  const now = useClock(1000)
  return <time className="mini-clock">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit',
    hour12: prefs.clock.format === 'device' ? undefined : prefs.clock.format === '12h' })}</time>
}
type Playback = { muted: boolean; active: boolean; fit: 'contain' | 'cover'; toggleAudio?: () => void }

function Source({ file, kind, name, preview, muted = true, active = true, fit = 'contain', toggleAudio, ready }: {
  file: Blob; kind: MediaItem['kind']; name: string; preview?: boolean; ready?: (ok: boolean) => void
} & Partial<Playback>) {
  const [url, setUrl] = useState('')
  const [broken, setBroken] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const needsTap = useRef(false)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const src = URL.createObjectURL(file)
    setUrl(src)
    return () => URL.revokeObjectURL(src)
  }, [file])
  function play() {
    void video.current?.play().catch(error => {
      if (error.name !== 'AbortError') { needsTap.current = true; setBlocked(true) }
    })
  }
  useEffect(() => {
    const el = video.current
    if (!el) return
    let suspended = false
    const resume = () => {
      if (!preview && active && !suspended && !document.hidden && !needsTap.current && el.paused) play()
    }
    // Android can resume the activity before the WebView becomes visible again.
    const visibilityChanged = () => {
      if (document.hidden) el.pause()
      else resume()
    }
    if (active) resume(); else el.pause()
    const offResume = onResume(() => { suspended = false; resume() })
    const offPause = onPause(() => { suspended = true; el.pause() })
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      el.pause()
      offResume()
      offPause()
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [url, preview, active])
  if (!url) return null
  const fail = () => { setBroken(true); ready?.(false) }
  const style = { objectFit: fit }
  return broken ? <p role="alert">This device cannot display this file. Choose a supported format or codec.</p>
    : kind === 'image' ? <img className="ambient-asset" style={style} src={url} alt={name} draggable={false} onLoad={() => ready?.(true)} onError={fail}/>
    : <><video className="ambient-asset" style={style} ref={video} src={url} aria-label={name} playsInline loop muted={preview || muted} preload="auto" controls={preview}
        onPlaying={() => { needsTap.current = false; setBlocked(false) }}
        onLoadedData={() => ready?.(true)} onError={fail}/>
      {blocked && active && <button className="widget-action ambient-play" onClick={play}>Tap to play</button>}
      {toggleAudio && <button type="button" className="widget-action sanctuary-audio" onClick={() => {
        const el = video.current
        // Apply the choice and retry inside the tap so WebView can grant playback with sound.
        if (el) el.muted = !muted
        toggleAudio()
        if (el?.paused) play()
      }}>{muted ? 'Unmute video' : 'Mute video'}</button>}</>
}
function StoredMedia({ item, ...playback }: { item: MediaItem } & Playback) {
  const [file, setFile] = useState<Blob>()
  const [failed, fail] = useState(false)
  useEffect(() => {
    let active = true
    void loadMedia(item).then(f => { if (active) setFile(f) }, () => { if (active) fail(true) })
    return () => { active = false }
  }, [item])
  return failed ? <p role="alert">File unavailable. Import it again from your library.</p>
    : file ? <Source file={file} kind={item.kind} name={item.name} {...playback}/> : null
}
function ImagePreview({ item }: { item: MediaItem }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    let src: string | undefined
    void loadMedia(item).then(file => {
      if (!active) return
      src = URL.createObjectURL(file)
      setUrl(src)
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (src) URL.revokeObjectURL(src) }
  }, [item])
  return url && !failed ? <img className="sanctuary-thumbnail" src={url} alt="" draggable={false}
    decoding="async" onError={() => setFailed(true)}/> : null
}

export function SanctuaryWidget() {
  const { prefs } = useDisplay()
  const { data: items = [] } = useQuery(library)
  const { data: def } = useQuery(preferred)
  const { data: selected } = useQuery(selection)
  const current = resolveMedia(['intro', 'quote', ...items.map(item => item.id), 'import'], selected, def)
  const item = items.find(row => row.id === current)
  const quote = quotes[prefs.quoteIndex]
  return <section className="widget-content sanctuary-widget"><h2 className="widget-title">Sanctuary</h2>
    {item?.kind === 'image' && item.size <= 1024 * 1024 && <ImagePreview key={item.id} item={item}/>}
    {current === 'quote' ? <blockquote><p>{quote.text}</p>{quote.author && <cite>{quote.author}</cite>}</blockquote>
      : <p>{item ? (item.kind === 'video' ? 'Video · ' : 'Image · ') + item.name : 'Ambient library'}</p>}
    <Link className="widget-action" to="/sanctuary">Open Sanctuary</Link></section>
}
export function Sanctuary() {
  const location = useLocation()
  const navigate = useNavigate()
  const libraryFromRoute = new URLSearchParams(location.search).get('library') === '1'
  const { data: items = [], error } = useQuery(library)
  const def = useQuery(preferred)
  const { prefs, update } = useDisplay()
  const { data: selected } = useQuery(selection)
  const [audioControls, setAudioControls] = useState<{ itemId: string }>()
  const [showLibrary, setManage] = useState(false)
  const manage = showLibrary || libraryFromRoute
  const [draft, setDraft] = useState<File>()
  const [ready, setReady] = useState(false)
  const [message, report] = useState('')
  const [busy, pending] = useState(false)
  const slots = ['intro', 'quote', ...items.map(item => item.id), 'import']
  const current = resolveMedia(slots, selected, def.data)
  const item = items.find(row => row.id === current)
  const video = item?.kind === 'video'
  const { sanctuary } = prefs
  const fitKey = video ? 'videoFit' : 'imageFit'
  const fit = sanctuary[fitKey]
  const quote = quotes[prefs.quoteIndex]
  useEffect(() => {
    if (!audioControls) return
    const hide = () => setAudioControls(undefined)
    const timer = window.setTimeout(hide, 3000)
    const offPause = onPause(hide)
    return () => { window.clearTimeout(timer); offPause() }
  }, [audioControls])

  function showAudio() {
    if (video && item && !manage) setAudioControls({ itemId: item.id })
  }
  function toggleAudio() {
    update({ sanctuary: { ...sanctuary, muted: !sanctuary.muted } })
  }
  function openLibrary() {
    setAudioControls(undefined)
    setManage(true)
  }
  function select(id: string) {
    setAudioControls(undefined)
    void selectMedia(id).catch(() => { report('Unable to save the Sanctuary selection.'); openLibrary() })
  }
  function step(n: number) { const id = slots[slots.indexOf(current) + n]; if (id) select(id) }
  const gesture = useWidgetGestures(step, openLibrary, undefined, target => {
    if (target.matches('video.ambient-asset')) showAudio()
  })
  async function run(action: () => Promise<unknown>) {
    pending(true); report('')
    try { await action() } catch (e) { report(e instanceof Error ? e.message : 'Local storage is unavailable.') }
    finally { pending(false) }
  }
  const picker = useRef<HTMLInputElement>(null)
  const [accept, acceptType] = useState('image/*,video/*')
  function pick(video = false) {
    if (!picker.current) return
    picker.current.accept = video ? 'video/*' : 'image/*,video/*'
    acceptType(picker.current.accept)
    picker.current.click()
  }
  function close() {
    if (busy) return
    setDraft(undefined); setManage(false); report('')
    if (libraryFromRoute) {
      if (location.state?.openedLibrary) navigate(-1)
      else navigate('/sanctuary', { replace: true })
    }
  }
  return <section className="sanctuary" aria-label="Sanctuary" data-video={video} tabIndex={0} {...gesture} onKeyDown={e => {
    if (e.target !== e.currentTarget) return
    if (e.key.toLowerCase() === 'g') { openLibrary(); e.preventDefault(); return }
    if (video && e.key === 'Enter') { showAudio(); e.preventDefault(); return }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { step(e.key === 'ArrowDown' ? 1 : -1); e.preventDefault() }
  }}>
    <MiniClock /><button className="widget-action library-button" onClick={openLibrary}>Library</button>
    <div key={current} className="ambient-stage" onContextMenu={e => e.preventDefault()}>
      {item ? <StoredMedia item={item} muted={sanctuary.muted} active={!manage} fit={fit}
        toggleAudio={video && !manage && audioControls?.itemId === item.id ? () => { toggleAudio(); showAudio() } : undefined}/>
        : current === 'quote' ? <blockquote><p>“{quote.text}”</p><cite>{quote.author}</cite></blockquote>
      : <div><h1>{current === 'intro' ? 'Sanctuary' : 'Your media'}</h1>
        <p>{current === 'intro' ? 'Choose a video for your ambient display.' : 'Add an image or video from this device.'}</p>
        <button className="widget-action primary" onClick={() => pick(current === 'intro')}>{current === 'intro' ? 'Import Video' : 'Import media'}</button></div>}
    </div>
    <input hidden type="file" ref={picker} accept={accept} onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ''
      if (!file) return
      openLibrary(); report(''); setReady(false)
      try { validateMedia(file); setDraft(file) } catch (err) { setDraft(undefined); report((err as Error).message) }
    }}/>
    {manage && <Modal title={draft ? 'Preview import' : 'Sanctuary library'} close={close}>
      {(error || message) && <p role="alert">{error || message}</p>}
      {draft ? <><div className="import-preview"><Source key={draft.name + draft.lastModified} file={draft} kind={mediaKind(draft)} name={draft.name} preview ready={setReady}/></div>
        <p>{draft.name} · {(draft.size / 1048576).toFixed(1)} MiB</p>
        <button className="widget-action primary" disabled={!ready || busy} onClick={() => void run(async () => {
          await importMedia(draft)
          setDraft(undefined); setManage(false)
          if (libraryFromRoute) navigate('/sanctuary', { replace: true })
        })}>{busy ? 'Importing…' : 'Add to library'}</button></> : <>
        <div className="page-actions">
          <button className="widget-action" onClick={() => pick()}>Import media</button>
          <button className="widget-action" onClick={() => {
            update({ quoteIndex: (prefs.quoteIndex + 1) % quotes.length }); select('quote'); close()
          }}>Next quote</button>
          {item && <button className="widget-action" onClick={() => update({ sanctuary: {
            ...sanctuary, [fitKey]: fit === 'cover' ? 'contain' : 'cover',
          } })}>{fit === 'cover' ? 'Fit to screen' : 'Fill screen'}</button>}
          {video && <button className="widget-action" onClick={toggleAudio}>
            {sanctuary.muted ? 'Unmute video' : 'Mute video'}</button>}
        </div>
        {[{ id: 'quote', name: 'Quote' }, ...items].map((row, i) => <article className="library-row" key={row.id}>
          <strong>{row.name}</strong><button className="widget-action" onClick={() => { select(row.id); close() }}>View</button>
          <button className="widget-action" disabled={busy || def.data === row.id} onClick={() => void run(() => setDefault(row.id))}>
            {def.data === row.id ? 'Default' : 'Set default'}</button>
          {'kind' in row && <><button className="widget-action" aria-label={'Move up '+row.name} disabled={busy || i === 1} onClick={() => void run(() => reorderMedia(row.id,-1))}>↑</button>
            <button className="widget-action" aria-label={'Move down '+row.name} disabled={busy || i === items.length} onClick={() => void run(() => reorderMedia(row.id,1))}>↓</button>
            <button className="widget-action" disabled={busy} onClick={() => { if (window.confirm('Remove this imported copy?')) void run(() => removeMedia(row as MediaItem)) }}>Remove</button></>}
        </article>)}
      </>}
    </Modal>}
  </section>
}
