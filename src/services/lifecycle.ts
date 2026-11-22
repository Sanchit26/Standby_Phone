import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

// Native listeners live for the lifetime of the app. Browser pages also resume via bfcache.
const listeners = new Set<() => void>()
const pauseListeners = new Set<() => void>()
function pause() {
  for (const listener of pauseListeners) listener()
}
export function onPause(listener: () => void) {
  pauseListeners.add(listener)
  return () => { pauseListeners.delete(listener) }
}
function resume() {
  for (const listener of listeners) listener()
}
function handleAndroidBack({ canGoBack }: { canGoBack: boolean }) {
  const modal = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog:modal')).at(-1)
  if (modal) {
    // Use the same cancel handler as Escape, including any save-in-progress guard.
    if (typeof modal.requestClose === 'function') modal.requestClose()
    else if (modal.dispatchEvent(new Event('cancel', { cancelable: true }))) modal.close()
    return
  }
  if (canGoBack) window.history.back()
}
export function initializeLifecycle() {
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', state => { if (state.isActive) resume() })
      .catch(console.error)
    void App.addListener('pause', pause).catch(console.error)
    if (Capacitor.getPlatform() === 'android') {
      void App.addListener('backButton', handleAndroidBack).catch(console.error)
    }
  } else {
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume() })
    window.addEventListener('pageshow', resume)
  }
}

export function onResume(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
