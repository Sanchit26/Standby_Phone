import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

// One native listener for the lifetime of the app. Browser pages also resume via bfcache.
const listeners = new Set<() => void>()
function resume() {
  for (const listener of listeners) listener()
}
export function initializeLifecycle() {
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', state => { if (state.isActive) resume() })
      .catch(console.error)
  } else {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume() })
    window.addEventListener('pageshow', resume)
  }
}

export function onResume(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
