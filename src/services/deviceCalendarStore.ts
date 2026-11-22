import { localDate } from '../storage/calendar.ts'
import { deviceEntries, type DeviceOccurrence } from '../storage/calendarView.ts'

export type CalendarPermission = 'prompt' | 'prompt-with-rationale' | 'denied' | 'granted'
export interface DeviceCalendarInfo { id: string; name: string; color?: string }
export interface DeviceCalendarBridge {
  checkPermissions(): Promise<{ calendar: CalendarPermission }>
  requestAccess(): Promise<{ calendar: CalendarPermission }>
  calendars(): Promise<{ calendars: DeviceCalendarInfo[] }>
  instances(query: { ids: string[]; begin: number; end: number }): Promise<{ events: DeviceOccurrence[] }>
  viewEvent(event: Pick<DeviceOccurrence, 'eventId' | 'begin' | 'end' | 'allDay'>): Promise<void>
}
interface CalendarSnapshot {
  enabled: boolean
  access: CalendarPermission | 'checking' | 'unsupported' | 'unavailable'
  calendars: DeviceCalendarInfo[]
  refreshedAt?: number
  error?: string
}
export const monthKey = (year: number, month: number) => localDate(new Date(year, month, 1))

export function createDeviceCalendarStore(bridge?: DeviceCalendarBridge) {
  let snapshot: CalendarSnapshot = { enabled: false, access: bridge ? 'checking' : 'unsupported', calendars: [] }
  let ids: string[] = []
  let revision = 0
  let accessCheck: Promise<boolean> | undefined
  const listeners = new Set<() => void>()
  const months = new Map<string, ReturnType<typeof deviceEntries>>()
  const inflight = new Map<string, Promise<void>>()
  let viewed: { year: number; month: number } | undefined
  function publish(patch: Partial<CalendarSnapshot> = {}) {
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }
  function configure(enabled: boolean, selected: string[]) {
    if (enabled === snapshot.enabled && selected.join(',') === ids.join(',')) return
    ids = selected
    revision++
    accessCheck = undefined
    inflight.clear()
    months.clear()
    publish({ enabled, calendars: enabled ? snapshot.calendars : [], refreshedAt: undefined, error: undefined })
  }
  async function inspect() {
    if (!bridge || !snapshot.enabled) return false
    if (accessCheck) return accessCheck
    const version = revision
    accessCheck = (async () => {
      try {
        const { calendar } = await bridge.checkPermissions()
        if (version !== revision) return false
        if (calendar !== 'granted') {
          months.clear()
          publish({ access: calendar, calendars: [], refreshedAt: undefined, error: undefined })
          return false
        }
        const next = (await bridge.calendars()).calendars
        if (version !== revision) return false
        if (snapshot.calendars.some(old => !next.some(row => row.id === old.id))) months.clear()
        publish({ access: 'granted', calendars: next, error: undefined })
        return true
      } catch {
        if (version === revision) {
          months.clear()
          publish({ access: 'unavailable', calendars: [], refreshedAt: undefined, error: 'Android Calendar Provider is unavailable.' })
        }
        return false
      } finally {
        if (version === revision) accessCheck = undefined
      }
    })()
    return accessCheck
  }
  async function requestAccess() {
    if (!bridge) return 'unsupported' as const
    try {
      const { calendar } = await bridge.requestAccess()
      if (snapshot.enabled) await refresh()
      return calendar
    } catch {
      if (snapshot.enabled) publish({ error: 'Could not open Android calendar permission settings.' })
      return 'unavailable' as const
    }
  }
  function loadMonth(year: number, month: number, force = false): Promise<void> {
    const key = monthKey(year, month)
    if (!bridge || !snapshot.enabled || !ids.length || (!force && months.has(key))) return Promise.resolve()
    const existing = inflight.get(key)
    if (existing) return existing
    const version = revision
    const request = (async () => {
      // Yield before entering the provider so the in-flight entry is installed.
      await Promise.resolve()
      try {
        if (snapshot.access !== 'granted' && !await inspect()) return
        if (version !== revision) return
        const selected = ids.filter(id => snapshot.calendars.some(row => row.id === id))
        if (!selected.length) return
        // A two-day margin covers UTC all-day dates in every local time zone.
        const begin = +new Date(year, month, -1)
        const end = +new Date(year, month + 1, 3)
        const { events } = await bridge.instances({ ids: selected, begin, end })
        if (version !== revision || snapshot.access !== 'granted') return
        months.delete(key)
        months.set(key, deviceEntries(events.filter(event => selected.includes(event.calendarId)), key, monthKey(year, month + 1)))
        if (months.size > 4) months.delete(months.keys().next().value!)
        publish({ refreshedAt: Date.now(), error: undefined })
      } catch (error) {
        if (version === revision) {
          if ((error as { code?: string })?.code === 'PERMISSION') await inspect()
          else publish({ error: 'Could not refresh device events. Use Refresh to try again.' })
        }
      } finally {
        if (version === revision) inflight.delete(key)
      }
    })()
    inflight.set(key, request)
    return request
  }
  async function refresh() {
    if (!await inspect()) return
    const now = new Date()
    await loadMonth(now.getFullYear(), now.getMonth(), true)
    if (viewed && monthKey(viewed.year, viewed.month) !== monthKey(now.getFullYear(), now.getMonth())) {
      await loadMonth(viewed.year, viewed.month, true)
    }
  }
  async function visit(year: number, month: number) {
    viewed = { year, month }
    await loadMonth(year, month, true)
  }
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    month: (key: string) => snapshot.enabled && snapshot.access === 'granted' ? months.get(key) : undefined,
    configure, inspect, requestAccess, refresh, loadMonth, visit,
    leave(year: number, month: number) {
      if (viewed?.year === year && viewed.month === month) viewed = undefined
    },
    async viewEvent(event: DeviceOccurrence) {
      if (!bridge || !snapshot.enabled || snapshot.access !== 'granted') throw new Error('Device calendar is unavailable.')
      await bridge.viewEvent({ eventId: event.eventId, begin: event.begin, end: event.end, allDay: event.allDay })
    },
  }
}
