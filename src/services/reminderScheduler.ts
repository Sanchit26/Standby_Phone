import { liveQuery } from 'dexie'
import { db } from '../storage/database'
import { onPause, onResume } from './lifecycle'
import { createReminderRepository, type Claim, type DeliveryResult } from './reminders'
import type { Reminder } from '../types/models'

export const reminders = createReminderRepository(db)
const checkClockMs = 30_000

// The foreground lifecycle owns these wakeups. A future native scheduler can use
// the same occurrence-claim and delivery boundary without mounting a React view.
export function startReminderScheduler(present: (claim: Claim, signal: AbortSignal) => Promise<DeliveryResult>) {
  let rows: Reminder[] = []
  let timer: number | undefined
  let visible = !document.hidden
  let stopped = false
  let running: AbortController | undefined

  function wake() {
    if (stopped || running || !visible) return
    clearTimeout(timer)
    if (!rows.length) return
    const now = Date.now()
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const next = rows.reduce((earliest, row) => Math.min(earliest, row.scheduledAt), Infinity)
    const zoneChanged = rows.some(row => row.schedule?.kind === 'daily' && row.timezone && row.timezone !== zone)
    if (next > now && !zoneChanged) {
      timer = window.setTimeout(wake, Math.min(next - now, checkClockMs))
      return
    }
    const controller = new AbortController()
    running = controller
    void (async () => {
      try {
        const claims = await reminders.reconcile(now, zone)
        for (const claim of claims) {
          const { delivery } = claim
          if (controller.signal.aborted) {
            await reminders.finish(delivery.id, { status: 'skipped', error: 'App became inactive before announcement.' })
            continue
          }
          let result: DeliveryResult
          try {
            await reminders.markStarted(delivery.id)
            result = controller.signal.aborted
              ? { status: 'skipped', error: 'App became inactive before announcement.' }
              : await present(claim, controller.signal)
          } catch (error) {
            result = { status: 'error', error: error instanceof Error ? error.message : 'Unable to present reminder.' }
          }
          await reminders.finish(delivery.id, result)
        }
      } catch (error) { console.error('Reminder scheduling failed', error) }
      finally {
        running = undefined
        // Use the latest observer snapshot. Delay retries if a failed transaction left a due row.
        if (!stopped && visible) timer = window.setTimeout(wake, rows.some(row => row.scheduledAt <= now) ? 1000 : 0)
      }
    })()
  }

  function pause() {
    visible = false
    clearTimeout(timer)
    running?.abort()
  }
  const observer = liveQuery(reminders.pendingRows).subscribe({
    next: snapshot => { rows = snapshot; wake() },
    error: error => console.error('Unable to observe reminders', error),
  })
  const offResume = onResume(() => { visible = true; wake() })
  const offPause = onPause(pause)
  return () => { stopped = true; pause(); observer.unsubscribe(); offResume(); offPause() }
}
