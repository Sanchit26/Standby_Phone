import { useEffect, useState } from 'react'
import { onResume } from '../services/lifecycle'

export function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const interval = window.setInterval(refresh, intervalMs)
    const unsubscribe = onResume(refresh)
    return () => {
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [intervalMs])
  return now
}
