import { Capacitor, registerPlugin } from '@capacitor/core'
import { onPause, onResume } from './lifecycle'

const shiftInterval = 3 * 60_000
const idleTimeout = 15 * 60_000
const interactionGrace = 2000
const offsets = [[2, -2], [-2, 2], [4, 1], [-4, -1], [1, 4], [-1, -4], [3, 3], [-3, -3]]
const android = Capacitor.getPlatform() === 'android'
const brightness = registerPlugin<{ setDimmed(options: { dimmed: boolean }): Promise<void> }>('StandbyBrightness')

export function startOledProtection() {
  const root = document.documentElement
  let active = !document.hidden
  let dimmed = false
  let lastInput = performance.now()
  let nextShift = lastInput + shiftInterval
  let phase = 0
  let timeout: number | undefined
  const pointers = new Set<number>()

  function dim(value: boolean) {
    if (dimmed === value) return
    dimmed = value
    if (android) void brightness.setDimmed({ dimmed: value }).catch(console.error)
    else root.toggleAttribute('data-oled-dimmed', value)
  }

  function update() {
    clearTimeout(timeout)
    timeout = undefined
    if (!active || document.hidden) return
    const modal = !!document.querySelector('dialog:modal')
    if (modal || pointers.size) { dim(false); return }
    const now = performance.now()
    const editing = document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]), select, textarea, [contenteditable="true"]')
    const shiftAt = Math.max(nextShift, lastInput + interactionGrace)
    if (!editing && now >= shiftAt) {
      const [x, y] = offsets[phase++ % offsets.length]
      root.style.setProperty('--oled-x', x + 'px')
      root.style.setProperty('--oled-y', y + 'px')
      root.setAttribute('data-oled-shifted', '')
      nextShift = now + shiftInterval
    }
    dim(now >= lastInput + idleTimeout)
    const deadline = Math.min(editing ? Infinity : Math.max(nextShift, lastInput + interactionGrace),
      dimmed ? Infinity : lastInput + idleTimeout)
    if (Number.isFinite(deadline)) timeout = window.setTimeout(update, deadline - now)
  }

  function input(event: Event) {
    if (!event.isTrusted || !active) return
    const wasHeld = pointers.size > 0
    if (event instanceof PointerEvent) {
      if (event.type === 'pointerdown') pointers.add(event.pointerId)
      if (event.type === 'pointerup' || event.type === 'pointercancel' ||
          (event.type === 'pointermove' && event.pointerType === 'mouse' && event.buttons === 0)) {
        pointers.delete(event.pointerId)
      }
    }
    lastInput = performance.now()
    // High-frequency moves do not need to replace the pending deadline.
    if (event.type !== 'pointermove' || dimmed || (wasHeld && !pointers.size) || timeout === undefined) update()
  }

  function pause() {
    active = false
    pointers.clear()
    clearTimeout(timeout)
    timeout = undefined
    dim(false)
  }
  const offPause = onPause(pause)
  const offResume = onResume(() => {
    active = true
    lastInput = performance.now()
    nextShift = lastInput + shiftInterval
    update()
  })
  const events = ['pointerdown', 'pointerup', 'pointercancel', 'pointermove', 'wheel', 'keydown']
  for (const type of events) window.addEventListener(type, input, { capture: true, passive: true })
  // A reminder can open without an input event. Keep every modal at normal brightness.
  const dialogs = new MutationObserver(update)
  dialogs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] })
  document.addEventListener('focusin', update)
  document.addEventListener('focusout', update)
  window.addEventListener('hashchange', update)
  update()
  return () => {
    pause()
    offPause()
    offResume()
    for (const type of events) window.removeEventListener(type, input, true)
    dialogs.disconnect()
    document.removeEventListener('focusin', update)
    document.removeEventListener('focusout', update)
    window.removeEventListener('hashchange', update)
    root.removeAttribute('data-oled-shifted')
    root.style.removeProperty('--oled-x')
    root.style.removeProperty('--oled-y')
  }
}
