import { Ornament } from '../../themes/Ornament'
import { useLocation, useNavigate } from 'react-router-dom'
import { ClockGallery } from '../../components/clock/ClockGallery'
import { useClockHold } from '../../hooks/useClockHold'
import { TimerPanel } from '../../components/timer/TimerPanel'
import { useDisplay } from '../../app/contexts'
import { faces } from '../../components/clock/registry'
import { Countdown } from '../../components/timer/Countdown'
import { WidgetCarousel } from '../../components/widgets/WidgetCarousel'
import { useClock } from '../../hooks/useClock'
import { TodayEvents } from '../Calendar/Calendar'
import './standby.css'

function StandbyDate() {
  const now = useClock(30_000)
  return <time className="standby-date" dateTime={now.toISOString()}>
    {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
  </time>
}

export function Standby() {
  const { prefs } = useDisplay()
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const timerOpen = params.get('timer') === 'controls'
  function openTimer() {
    params.set('timer', 'controls')
    navigate({ search: params.toString() }, { state: { openedTimer: true } })
  }
  function closeTimer() {
    if (location.state?.openedTimer) navigate(-1)
    else {
      params.delete('timer')
      navigate({ search: params.toString() }, { replace: true })
    }
  }
  const galleryOpen = params.get('clock') === 'faces'
  function openGallery() {
    if (galleryOpen) return
    params.set('clock', 'faces')
    navigate({ search: params.toString() }, { state: { openedClockGallery: true } })
  }
  function closeGallery() {
    if (location.state?.openedClockGallery) navigate(-1)
    else {
      params.delete('clock')
      navigate({ search: params.toString() }, { replace: true })
    }
  }
  const hold = useClockHold(openGallery)
  const Face = faces[prefs.face].Component

  return <>
    <section aria-label="Standby" className="standby">
      <Ornament variant="screen" />
      <StandbyDate /><TodayEvents compact />
      <div className="standby-clock" tabIndex={0} aria-label="Clock. Hold or press Enter to choose a face."
        {...hold} onContextMenu={event => event.preventDefault()}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openGallery()
          }
        }}><Ornament variant="brackets" /><Face {...prefs.clock} /></div>
      <div className="standby-timer"><button type="button" className="standby-timer-trigger" aria-label="Open focus timer"
        aria-haspopup="dialog" onClick={openTimer}><Ornament crest="bottom" /><Countdown /></button></div>
      <WidgetCarousel />
    </section>
    {galleryOpen && <ClockGallery close={closeGallery} />}
    {timerOpen && <TimerPanel close={closeTimer} />}
    <p className="standby-rotate">Rotate your device to view Standby.</p>
  </>
}
