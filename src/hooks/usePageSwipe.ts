import { useRef, type PointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { adjacentPage, controls, gestureAxis } from './gestures'
type Origin = { id: number; x: number; y: number; key: string; axis?: ReturnType<typeof gestureAxis> }

export function usePageSwipe() {
  const origin = useRef<Origin | null>(null)
  const { pathname, key } = useLocation()
  const navigate = useNavigate()
  function cancel() { origin.current = null }
  function onPointerDown(e: PointerEvent<HTMLElement>) {
    cancel()
    const target = e.target as Element
    if (!e.isPrimary || e.button !== 0 || target.closest(controls) || document.querySelector('dialog:modal')) return
    origin.current = { id: e.pointerId, x: e.clientX, y: e.clientY, key }
    target.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const start = origin.current
    if (!start || start.id !== e.pointerId) return
    start.axis ??= gestureAxis(e.clientX - start.x, e.clientY - start.y)
  }
  function onPointerUp(e: PointerEvent<HTMLElement>) {
    const start = origin.current
    cancel()
    if (!start || start.id !== e.pointerId || start.key !== key) return
    const dx = e.clientX - start.x
    if (start.axis === 'vertical' || window.getSelection()?.toString() || document.querySelector('dialog:modal') || Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(e.clientY - start.y)) return
    const path = adjacentPage(pathname, dx < 0 ? 1 : -1)
    if (path) navigate(path)
  }
  function onKeyDown(e: import('react').KeyboardEvent<HTMLElement>) {
    if (e.defaultPrevented || (e.target as Element).closest(controls) || document.querySelector('dialog:modal')) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const path = adjacentPage(pathname, e.key === 'ArrowRight' ? 1 : -1)
      if (path) { e.preventDefault(); navigate(path) }
    }
  }
  return { onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel, onLostPointerCapture: cancel }
}
