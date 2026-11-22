import { createContext, useContext } from 'react'
import type { UserPreferences } from '../services/preferences'
import type { Timer, TimerAction } from '../components/timer/model'

type DisplayState = { prefs: UserPreferences; update: (patch: Partial<UserPreferences>) => void }
type TimerState = { timer: Timer; lastDuration: number; dispatch: (action: TimerAction) => Promise<boolean>; error: string; notice: string; dismiss: () => void }
export const DisplayContext = createContext<DisplayState | null>(null)
export const TimerContext = createContext<TimerState | null>(null)

export function useDisplay() {
  const state = useContext(DisplayContext)
  if (!state) throw new Error('DisplayProvider required')
  return state
}
export function useTimer() {
  const state = useContext(TimerContext)
  if (!state) throw new Error('TimerProvider required')
  return state
}

