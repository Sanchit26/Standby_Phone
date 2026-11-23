import { useEffect, useRef, type PointerEvent } from 'react'

import { controls, gestureAxis } from './gestures'
type Point = { x: number; y: number }
type Press = Point & { id: number; moved: boolean; axis?: ReturnType<typeof gestureAxis>; scroll: HTMLElement | null; top: number; scrolling?: boolean; timer: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function useWidgetGestures(change: (step: number) => void, manage?: () => void, expand?: () => void,
  onTap?: (target: Element) => void) {
  const press = useRef<Press | null>(null)
  const tap = useRef<(Point & { at: number; type: string }) | null>(null)
  function clear() {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }
  function cancel() { clear(); tap.current = null }
  useEffect(() => clear, [])

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const target = event.target as Element
      if (!event.isPrimary || event.button !== 0 || target.closest(controls)) {
        cancel()
        return
      }
      clear()
      const { pointerId: id, clientX: x, clientY: y } = event
      const timer = manage ? window.setTimeout(() => { cancel(); manage() }, 600) : 0
      const scroll = target.closest<HTMLElement>('.tasks-list, .widget-scroll')
      press.current = { id, x, y, moved: false, scroll, top: scroll?.scrollTop ?? 0, timer }
      target.setPointerCapture(id)
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = press.current
      if (!start || start.id !== event.pointerId) return
      const dx = Math.abs(event.clientX - start.x)
      const dy = Math.abs(event.clientY - start.y)
      if (!start.moved && Math.hypot(dx, dy) > 10) {
        window.clearTimeout(start.timer)
        start.moved = true
        tap.current = null
      }
      start.axis ??= gestureAxis(dx, dy)
      if (start.axis === 'vertical' && start.scroll) {
        const delta = start.y - event.clientY
        const max = start.scroll.scrollHeight - start.scroll.clientHeight
        start.scrolling ??= delta > 0 ? start.top < max - 1 : start.top > 1
        if (start.scrolling) start.scroll.scrollTop = start.top + delta
      }
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const start = press.current
      if (!start || start.id !== event.pointerId) return
      clear()
      const x = event.clientX
      const y = event.clientY
      const dx = x - start.x
      const dy = y - start.y
      if ((!start.axis || start.axis === 'vertical') && !start.scrolling && gestureAxis(dx, dy) === 'vertical' && Math.abs(dy) >= 50) {
        tap.current = null
        change(dy < 0 ? 1 : -1)
        return
      }
      if (start.moved || distance(start, { x, y }) > 10) {
        tap.current = null
        return
      }
      onTap?.(event.target as Element)
      if (!expand) return
      const now = performance.now()
      const last = tap.current
      if (last && now - last.at <= 320 && last.type === event.pointerType && distance(last, { x, y }) <= 24) {
        tap.current = null
        expand()
      } else tap.current = { x, y, at: now, type: event.pointerType }
    },
    onPointerCancel: cancel,
    onLostPointerCapture(event: PointerEvent<HTMLElement>) {
      if (press.current?.id === event.pointerId) cancel()
    },
  }
}
