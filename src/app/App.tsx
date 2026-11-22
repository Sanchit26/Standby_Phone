import { useTimer } from './contexts'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Standby } from '../pages/Standby/Standby'
import { QuestHub } from '../pages/QuestHub/QuestHub'
import { Sanctuary } from '../pages/Sanctuary/Sanctuary'
import { Settings } from '../pages/Settings/Settings'
import { usePageSwipe } from '../hooks/usePageSwipe'

import { Calendar } from '../pages/Calendar/Calendar'
import { Spotify } from '../pages/Spotify/Spotify'
export function App() {
  const gesture = usePageSwipe()
  const { notice } = useTimer()
  const { search } = useLocation()
  return <div className="app-shell">
    <main tabIndex={0} {...gesture}><Routes>
      <Route path="/" element={<Standby />} />
      <Route path="/quests" element={<QuestHub />} />
      <Route path="/calendar" element={<Calendar />} />
      <Route path="/spotify" element={<Spotify />} />
      <Route path="/sanctuary" element={<Sanctuary />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<p>Page not found.</p>} />
    </Routes></main>
    {notice && new URLSearchParams(search).get('timer') !== 'controls' && <div role="status" className="focus-toast">{notice}</div>}
  </div>
}
