import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Ornament } from '../themes/Ornament'
export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    el.showModal()
    return () => el.close()
  }, [])
  return <dialog ref={ref} aria-label={title} data-page-swipe="off" className="widget-dialog utility-dialog theme-panel"
    onCancel={e => { e.preventDefault(); close() }}>
    <Ornament /><header className="widget-dialog-header"><h2>{title}</h2><button className="widget-action" onClick={close}>Close</button></header>
    <div className="dialog-body">{children}</div>
  </dialog>
}
