import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './app/App'
import { DisplayProvider, TimerProvider } from './app/state'
import { loadPreferences, readJson } from './services/preferences'
import { focusTimer } from './storage/repositories'
import { initializeLifecycle } from './services/lifecycle'
import { db } from './storage/database'
import './themes/index.css'

const root = createRoot(document.getElementById('root')!)
async function start() {
  const [display, timer] = await Promise.all([loadPreferences(), readJson('timer'), db.open()])
  const initial = await focusTimer.load(timer)
  initializeLifecycle()
  root.render(<StrictMode>
    <DisplayProvider initial={display}><TimerProvider initial={initial}>
      <HashRouter><App /></HashRouter>
    </TimerProvider></DisplayProvider>
  </StrictMode>)
}
void start().catch(error => {
  console.error(error)
  root.render(<p role="alert">Local storage could not be opened. Reopen Standby to retry.</p>)
})
