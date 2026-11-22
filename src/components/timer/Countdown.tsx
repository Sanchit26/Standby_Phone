import { useTimer } from '../../app/contexts'
import { useClock } from '../../hooks/useClock'
import { elapsed, remaining, type Timer } from './model'

import { formatDuration } from './format'

function RunningCountdown({ timer }: { timer: Timer }) {
  const now = useClock(250)
  return <span>{formatDuration(timer.mode === 'stopwatch' ? elapsed(timer, now.getTime()) : remaining(timer, now.getTime()))}</span>
}

export function Countdown() {
  const { timer } = useTimer()
  const mode = timer.mode === 'stopwatch' ? 'Stopwatch' : 'Countdown'
  const label = timer.status === 'idle' || timer.label === mode || timer.label === 'Focus session' ? mode : mode + ' · ' + timer.label
  const state = timer.status === 'paused' ? ' · Paused' : timer.status === 'completed' ? ' · Complete'
    : timer.status === 'cancelled' ? ' · Cancelled' : ''

  return <span aria-label={mode} className="countdown">
    <span className="countdown-label" title={label + state}>{label}{state}</span>
    <span role="timer" className="countdown-value">
      {timer.status === 'running' ? <RunningCountdown timer={timer} /> : formatDuration(timer.mode === 'stopwatch' ? elapsed(timer) : remaining(timer))}
    </span>
  </span>
}

function SessionProgress({ timer }: { timer: Exclude<Timer, { status: 'idle' }> }) {
  const now = useClock(timer.status === 'running' ? 1000 : 60_000)
  if (timer.mode === 'stopwatch') return null
  if (timer.legacy && timer.status === 'completed') return null
  const done = elapsed(timer, now.getTime())
  return <div className="focus-progress">
    <span>{formatDuration(timer.plannedMs)} planned · {Math.floor(done * 100 / timer.plannedMs)}% elapsed</span>
    <progress className="widget-progress" aria-label="Focus elapsed" value={done} max={timer.plannedMs} />
  </div>
}

export function TimerProgress() {
  const { timer } = useTimer()
  return timer.status !== 'idle' && <SessionProgress timer={timer} />
}
