import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDisplay } from '../../app/contexts'
import { quotes } from '../../components/widgets/quotes'
import { Modal } from '../../components/Modal'
import { useClock } from '../../hooks/useClock'
import { useQuery } from '../../hooks/useQuery'
import { useWidgetGestures } from '../../hooks/useWidgetGestures'
import { onResume } from '../../services/lifecycle'
import { importMedia, library, loadMedia, mediaKind, preferred, removeMedia, reorderMedia, setDefault } from '../../storage/media'
import type { MediaItem } from '../../types/models'
import './sanctuary.css'

function MiniClock() {
  const { prefs } = useDisplay()
  const now = useClock(1000)
  return <time className="mini-clock">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit',
    hour12: prefs.clock.format === 'device' ? undefined : prefs.clock.format === '12h' })}</time>
}
function Source({ file, kind, name, preview, ready }: {
  file: Blob; kind: MediaItem['kind']; name: string; preview?: boolean; ready?: (ok: boolean) => void
}) {
  const [url, setUrl] = useState('')
  const [broken, setBroken] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const src = URL.createObjectURL(file)
    setUrl(src)
    return () => URL.revokeObjectURL(src)
  }, [file])
  useEffect(() => {
    const el = video.current
    if (!el) return
    const sync = () => {
      if (document.hidden) el.pause()
      else if (!preview) void el.play().catch(() => {})
    }
    const off = onResume(sync)
    document.addEventListener('visibilitychange', sync)
    return () => { el.pause(); off(); document.removeEventListener('visibilitychange', sync) }
  }, [url, preview])
  if (!url) return null
  const fail = () => { setBroken(true); ready?.(false) }
  return broken ? <p role="alert">This device cannot display this file. Choose a supported format or codec.</p>
    : kind === 'image' ? <img className="ambient-asset" src={url} alt={name} draggable={false} onLoad={() => ready?.(true)} onError={fail}/>
    : <video className="ambient-asset" ref={video} src={url} aria-label={name} playsInline loop muted autoPlay controls={preview}
        onLoadedData={() => ready?.(true)} onError={fail}/>
}
function StoredMedia({ item }: { item: MediaItem }) {
  const [file, setFile] = useState<Blob>()
  const [failed, fail] = useState(false)
  useEffect(() => {
    let active = true
    void loadMedia(item).then(f => { if (active) setFile(f) }, () => { if (active) fail(true) })
    return () => { active = false }
  }, [item])
  return failed ? <p role="alert">File unavailable. Import it again from your library.</p>
    : file ? <Source file={file} kind={item.kind} name={item.name}/> : null
}
export function SanctuaryWidget() {
  const items = useQuery(library)
  const def = useQuery(preferred)
  const item = items.data?.find(row => row.id === def.data)
  return <section className="widget-content"><h2 className="widget-title">Sanctuary</h2>
    <p>{item?.name || (def.data === 'quote' ? 'Quote' : 'Ambient library')} · {items.data?.length ?? 0} imported</p>
    <Link className="widget-action" to="/sanctuary">Open Sanctuary</Link></section>
}
export function Sanctuary() {
  const { data: items = [], error } = useQuery(library)
  const def = useQuery(preferred)
  const { prefs, update } = useDisplay()
  const [selected, select] = useState<string>()
  const [manage, setManage] = useState(false)
  const [draft, setDraft] = useState<File>()
  const [ready, setReady] = useState(false)
  const [message, report] = useState('')
  const [busy, pending] = useState(false)
  const slots = ['intro', 'quote', ...items.map(item => item.id), 'import']
  const candidate = selected ?? def.data ?? 'intro'
  const current = slots.includes(candidate) ? candidate : 'intro'
  const item = items.find(row => row.id === current)
  const quote = quotes[prefs.quoteIndex]
  function step(n: number) { const id = slots[slots.indexOf(current) + n]; if (id) select(id) }
  const gesture = useWidgetGestures(step)
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
  function close() { if (!busy) { setDraft(undefined); setManage(false); report('') } }
  return <section className="sanctuary" aria-label="Sanctuary" tabIndex={0} {...gesture} onKeyDown={e => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { step(e.key === 'ArrowDown' ? 1 : -1); e.preventDefault() }
  }}>
    <MiniClock /><button className="widget-action library-button" onClick={() => setManage(true)}>Library</button>
    <div key={current} className="ambient-stage">
      {item ? <StoredMedia item={item}/> : current === 'quote' ? <blockquote><p>“{quote.text}”</p><cite>{quote.author}</cite>
        <button className="widget-action" onClick={() => update({ quoteIndex: (prefs.quoteIndex + 1) % quotes.length })}>Next quote</button></blockquote>
      : <div><h1>{current === 'intro' ? 'Sanctuary' : 'Your media'}</h1>
        <p>{current === 'intro' ? 'Choose a video for your ambient display.' : 'Add an image or video from this device.'}</p>
        <button className="widget-action primary" onClick={() => pick(current === 'intro')}>{current === 'intro' ? 'Import Video' : 'Import media'}</button></div>}
    </div>
    <input hidden type="file" ref={picker} accept={accept} onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ''
      if (!file) return
      setManage(true); report(''); setReady(false)
      try { mediaKind(file); setDraft(file) } catch (err) { report((err as Error).message) }
    }}/>
    {manage && <Modal title={draft ? 'Preview import' : 'Sanctuary library'} close={close}>
      {(error || message) && <p role="alert">{error || message}</p>}
      {draft ? <><div className="import-preview"><Source key={draft.name + draft.lastModified} file={draft} kind={mediaKind(draft)} name={draft.name} preview ready={setReady}/></div>
        <p>{draft.name} · {(draft.size / 1048576).toFixed(1)} MiB</p>
        <button className="widget-action primary" disabled={!ready || busy} onClick={() => void run(async () => {
          const id = await importMedia(draft)
          if (!def.data && !items.length) await setDefault(id)
          select(id); setDraft(undefined); setManage(false)
        })}>{busy ? 'Importing…' : 'Add to library'}</button></> : <>
        <button className="widget-action" onClick={() => pick()}>Import media</button>
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
