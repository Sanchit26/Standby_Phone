import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { Ornament } from '../themes/Ornament'
import { startReminderScheduler } from '../services/reminderScheduler'
import { startSpeech } from '../services/speech'
import './reminderOverlay.css'

interface Notice { message: string; status: string; closing?: boolean; dismiss: () => void }
export function ReminderOverlay() {
  const [notice, setNotice] = useState<Notice>()
  const dialog = useRef<HTMLDialogElement>(null)
  const visible = notice !== undefined
  useLayoutEffect(() => {
    const el = dialog.current
    if (!visible || !el) return
    el.showModal()
    return () => el.close()
  }, [visible])

  useEffect(() => startReminderScheduler(async ({ reminder, delivery }, signal) => {
    const message = delivery.message || reminder.title
    const job = startSpeech(message, reminder, () => {
      setNotice(current => current && { ...current, status: 'Speaking' })
    }, true)
    let dismiss = () => {}
    const dismissed = new Promise<void>(resolve => { dismiss = resolve })
    let closing = false
    let hide: number | undefined
    let exit: number | undefined
    function close() {
      if (closing) return
      closing = true
      job.stop()
      if (signal.aborted || window.matchMedia('(prefers-reduced-motion: reduce)').matches) dismiss()
      else {
        setNotice(current => current && { ...current, closing: true })
        exit = window.setTimeout(dismiss, 140)
      }
    }
    signal.addEventListener('abort', close, { once: true })
    setNotice({ message, status: 'Announcing…', dismiss: close })
    try {
      const result = await job.done
      if (result.status !== 'silenced' && !closing && !signal.aborted) {
        const status = result.status === 'spoken' ? 'Announcement complete' : result.error || 'Speech unavailable'
        setNotice({ message, status, dismiss: close })
        hide = window.setTimeout(close, result.status === 'error' ? 7500 : 4500)
      }
      await dismissed
      return result
    } finally {
      clearTimeout(hide)
      clearTimeout(exit)
      signal.removeEventListener('abort', close)
      setNotice(undefined)
    }
  }), [])

  return visible && <dialog ref={dialog} className="widget-dialog reminder-overlay theme-panel" aria-label="Voice reminder" data-closing={notice.closing}
    data-page-swipe="off" onCancel={event => { event.preventDefault(); notice.dismiss() }}>
    <Ornament />
    <div className="reminder-overlay-body">
      <header><AudioLines aria-hidden="true" /><span>Voice reminder</span></header>
      <p className="reminder-message">{notice.message}</p>
      <footer>
        <span role="status">{notice.status}</span>
        <button className="widget-action" autoFocus onClick={notice.dismiss}>Silence / dismiss</button>
      </footer>
    </div>
  </dialog>
}
