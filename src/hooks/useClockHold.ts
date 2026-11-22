import { useLayoutEffect, useRef, type PointerEvent } from 'react'

export function useClockHold(open: () => void) {
  const hold = useRef<{ id: number; x: number; y: number; timer: number } | null>(null)
  function clear() {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
  }
  useLayoutEffect(() => clear, [])

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      clear()
      if (!event.isPrimary || event.button !== 0) return
      const { pointerId: id, clientX: x, clientY: y } = event
      const timer = window.setTimeout(() => {
        clear()
        open()
      }, 600)
      hold.current = { id, x, y, timer }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = hold.current
      if (start && start.id === event.pointerId &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onLostPointerCapture: clear,
  }
}
