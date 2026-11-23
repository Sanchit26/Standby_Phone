import { Ornament } from '../../themes/Ornament'
import { useLayoutEffect, useRef } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useDisplay } from '../../app/contexts'
import { widgets, type WidgetId } from './registry'

export function WidgetGallery({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { prefs, update } = useDisplay()
  const { widgetOrder, widgetEnabled, widgetDefault } = prefs
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function move(index: number, step: number) {
    const order = [...widgetOrder]
    const destination = index + step
    if (destination < 0 || destination >= order.length) return
    const [id] = order.splice(index, 1)
    order.splice(destination, 0, id)
    update({ widgetOrder: order })
  }

  function toggle(id: WidgetId) {
    update({ widgetEnabled: widgetEnabled.includes(id)
      ? widgetEnabled.filter(enabled => enabled !== id) : [...widgetEnabled, id] })
  }

  return <dialog ref={dialog} className="widget-dialog widget-gallery theme-panel" data-page-swipe="off"
    aria-labelledby="widget-gallery-title" onCancel={event => { event.preventDefault(); close() }}>
    <Ornament />
    <header className="widget-dialog-header">
      <h2 id="widget-gallery-title">Manage widgets</h2>
      <button type="button" className="widget-action" autoFocus onClick={close}>Close</button>
    </header>
    <ol className="widget-gallery-list" aria-label="Widget order" tabIndex={0}>
      {widgetOrder.map((id, index) => {
        const definition = widgets[id]
        const enabled = widgetEnabled.includes(id)
        const required = enabled && widgetEnabled.length === 1
        return <li key={id}>
          <div className="widget-entry">
            <label><input type="checkbox" checked={enabled} disabled={required} onChange={() => toggle(id)} /> {definition.name}</label>
            <p>{required ? 'Keep at least one functional widget enabled.' : definition.description}</p>
          </div>
          <label className="widget-default">
            <input type="radio" name="widget-default" aria-label={`Default widget: ${definition.name}`} disabled={!enabled}
              checked={widgetDefault === id} onChange={() => update({ widgetDefault: id })} /> Default
          </label>
          <div className="widget-order-buttons">
            <button type="button" className="widget-action" disabled={index === 0}
              aria-label={`Move ${definition.name} up`} onClick={() => move(index, -1)}><ArrowUp /></button>
            <button type="button" className="widget-action" disabled={index === widgetOrder.length - 1}
              aria-label={`Move ${definition.name} down`} onClick={() => move(index, 1)}><ArrowDown /></button>
          </div>
        </li>
      })}
    </ol>
  </dialog>
}
