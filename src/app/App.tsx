import { useEffect, useLayoutEffect, useRef } from 'react'
import { useDeviceCalendarConnection } from '../hooks/useDeviceCalendar'
import { useDisplay, useTimer } from './contexts'
import { startOledProtection } from '../services/oledProtection'
import './oledProtection.css'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Standby } from '../pages/Standby/Standby'
import { QuestHub } from '../pages/QuestHub/QuestHub'
import { Sanctuary } from '../pages/Sanctuary/Sanctuary'
import { Settings } from '../pages/Settings/Settings'
import { usePageSwipe } from '../hooks/usePageSwipe'

import { Calendar } from '../pages/Calendar/Calendar'
import { Spotify } from '../pages/Spotify/Spotify'
import { ReminderOverlay } from '../components/ReminderOverlay'
export function App() {
  const gesture = usePageSwipe()
  useDeviceCalendarConnection()
  const { notice } = useTimer()
  const { oledProtection } = useDisplay().prefs
  useEffect(() => { if (oledProtection) return startOledProtection() }, [oledProtection])
  const { pathname, search } = useLocation()
  const viewport = useRef<HTMLElement>(null)
  useLayoutEffect(() => { viewport.current?.scrollTo(0, 0) }, [pathname])
  return <div className="app-shell">
    <main ref={viewport} className="app-viewport" tabIndex={0} {...gesture}><Routes>
      <Route path="/" element={<Standby />} />
      <Route path="/quests" element={<QuestHub />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/spotify" element={<Spotify />} />
      <Route path="/sanctuary" element={<Sanctuary />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<p>Page not found.</p>} />
    </Routes></main>
    <ReminderOverlay />
    {notice && new URLSearchParams(search).get('timer') !== 'controls' && <div role="status" className="focus-toast">{notice}</div>}
  </div>
}
