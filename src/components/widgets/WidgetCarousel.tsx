import { Ornament } from '../../themes/Ornament'
import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDisplay } from '../../app/contexts'
import { useWidgetGestures } from '../../hooks/useWidgetGestures'
import { widgets } from './registry'
import { WidgetGallery } from './WidgetGallery'
import './widgets.css'

export function WidgetCarousel() {
  const { prefs, update } = useDisplay()
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const mode = params.get('widget')
  const expanded = mode === 'fullscreen'
  const galleryOpen = mode === 'manage'
  const frame = useRef<HTMLDialogElement>(null)
  const restoreFocus = useRef(false)
  const inlineScroll = useRef<{ element: HTMLElement; top: number }[]>([])
  const [direction, setDirection] = useState(0)
  const enabled = prefs.widgetOrder.filter(id => prefs.widgetEnabled.includes(id))
  const index = enabled.indexOf(prefs.widget)
  const { Component, name } = widgets[prefs.widget]

  function open(next: 'manage' | 'fullscreen') {
    if (expanded || galleryOpen || params.get('clock') === 'faces') return
    if (next === 'fullscreen') {
      inlineScroll.current = Array.from(frame.current?.querySelectorAll<HTMLElement>('.tasks-list, .widget-scroll') ?? [],
        element => ({ element, top: element.scrollTop }))
    }
    params.set('widget', next)
    navigate({ search: params.toString() }, { state: { openedWidget: true } })
  }

  function close() {
    if (location.state?.openedWidget) navigate(-1)
    else {
      params.delete('widget')
      navigate({ search: params.toString() }, { replace: true })
    }
  }

  function change(step: number) {
    const target = enabled[index + step]
    if (!target) return
    setDirection(step)
    update({ widget: target })
  }

  const gestures = useWidgetGestures(change, () => open('manage'), () => open('fullscreen'))
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    element.close()
    if (expanded) element.showModal()
    else {
      const wasUnfocused = document.activeElement === document.body
      element.show()
      const focused = document.activeElement
      if (wasUnfocused && focused instanceof HTMLElement && element.contains(focused)) focused.blur()
      for (const item of inlineScroll.current) item.element.scrollTo(0, item.top)
      inlineScroll.current = []
    }
    return () => element.close()
  }, [expanded])

  useLayoutEffect(() => {
    if (galleryOpen || expanded) restoreFocus.current = true
    else if (restoreFocus.current) {
      frame.current?.querySelector<HTMLElement>('.widget-carousel')?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  }, [expanded, galleryOpen])

  return <div className="standby-widget" data-page-swipe={expanded || galleryOpen ? "off" : undefined}>
    <dialog ref={frame} className={expanded ? 'widget-dialog widget-fullscreen theme-panel' : 'widget-frame theme-panel'}
      aria-label={expanded ? `${name} fullscreen` : undefined} role={expanded ? 'dialog' : 'presentation'}
      onCancel={event => { event.preventDefault(); if (expanded) close() }}>
      <Ornament crest={expanded ? 'none' : 'both'} />
      <header className="widget-dialog-header" hidden={!expanded}>
        <h2>{name}</h2>
        <button type="button" className="widget-action" onClick={close}>Close</button>
      </header>
      <div className="widget-carousel" role="region" aria-label={`${name}, widget ${index + 1} of ${enabled.length}`}
        aria-description="Swipe vertically or use Up and Down to switch widgets. Hold or press G to manage. Double tap or press Enter to expand."
        tabIndex={expanded ? -1 : 0} {...(expanded || galleryOpen ? {} : gestures)}
        onContextMenu={event => { if (!expanded) event.preventDefault() }}
        onKeyDown={event => {
          if (expanded || galleryOpen || event.target !== event.currentTarget) return
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') change(event.key === 'ArrowUp' ? -1 : 1)
          else if (event.key === 'Enter') open('fullscreen')
          else if (event.key.toLowerCase() === 'g') open('manage')
          else return
          event.preventDefault()
        }}>
        <div key={prefs.widget} className="widget-slide" data-direction={direction}><Component expanded={expanded} /></div>
      </div>
    </dialog>
    {galleryOpen && <WidgetGallery close={close} />}
  </div>
}
