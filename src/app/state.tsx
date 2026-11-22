import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { Preferences } from '@capacitor/preferences'
import { remaining, type TimerAction } from '../components/timer/model'
import { normalizePreferences, type UserPreferences } from '../services/preferences'
import { focusTimer } from '../storage/repositories'
import { db } from '../storage/database'
import type { StoredTimer } from '../storage/focusRepository'
import { liveQuery } from 'dexie'
import { onResume } from '../services/lifecycle'

import { DisplayContext, TimerContext } from './contexts'

// Serialize native writes so a slower earlier update cannot replace a newer one.
let pending = Promise.resolve()
function save(key: string, state: unknown) {
  const value = JSON.stringify(state)
  pending = pending.then(() => Preferences.set({ key, value })).catch(error => {
    console.error('Could not save local setting', key, error)
  })
}

export function DisplayProvider({ initial, children }: PropsWithChildren<{ initial: UserPreferences }>) {
  const [prefs, setPrefs] = useState(initial)
  useLayoutEffect(() => { document.documentElement.dataset.theme = prefs.theme }, [prefs.theme])
  useEffect(() => { save('display', prefs) }, [prefs])
  const update = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs(current => normalizePreferences({ ...current, ...patch }))
  }, [])
  const value = useMemo(() => ({ prefs, update }), [prefs, update])
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>
}


export function TimerProvider({ initial, children }: PropsWithChildren<{ initial: StoredTimer }>) {
  const [{ timer, lastDuration }, setState] = useState(initial)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const dismiss = useCallback(() => setNotice(''), [])

  useEffect(() => {
    const subscription = liveQuery(() => db.timerState.get('current')).subscribe({
      next: state => { if (state) setState(state) },
      error: () => setError('Could not read the saved timer.'),
    })
    return () => subscription.unsubscribe()
  }, [])
  const dispatch = useCallback(async (action: TimerAction) => {
    try {
      const result = await focusTimer.apply(action)
      setError('')
      if (result.finishedLabel) setNotice('Completed · ' + result.finishedLabel)
      return true
    } catch (error) {
      console.error(error)
      setError('Could not save the focus timer. Please try again.')
      return false
    }
  }, [])
  useEffect(() => onResume(() => { void dispatch({ type: 'reconcile' }) }), [dispatch])
  useEffect(() => {
    if (timer.status !== 'running' || timer.mode === 'stopwatch') return
    let pending = false
    const id = window.setInterval(async () => {
      if (pending || remaining(timer) > 0) return
      pending = true
      await dispatch({ type: 'reconcile' })
      pending = false
    }, 1000)
    return () => window.clearInterval(id)
  }, [timer, dispatch])
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(dismiss, 6500)
    return () => window.clearTimeout(id)
  }, [notice, dismiss])
  const value = useMemo(() => ({ timer, lastDuration, dispatch, error, notice, dismiss }),
    [timer, lastDuration, dispatch, error, notice, dismiss])
  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
}
