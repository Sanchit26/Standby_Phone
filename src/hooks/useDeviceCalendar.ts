import { useEffect, useSyncExternalStore } from 'react'
import { useDisplay } from '../app/contexts'
import { deviceCalendar } from '../services/deviceCalendar'
import { monthKey } from '../services/deviceCalendarStore'
import { onResume } from '../services/lifecycle'

export function useDeviceCalendarStatus() {
  return useSyncExternalStore(deviceCalendar.subscribe, deviceCalendar.snapshot)
}

export function useDeviceMonth(year: number, month: number) {
  const { prefs } = useDisplay()
  const key = monthKey(year, month)
  const status = useDeviceCalendarStatus()
  useEffect(() => {
    if (prefs.deviceCalendar.enabled && status.access === 'granted') void deviceCalendar.loadMonth(year, month)
  }, [year, month, status.access, prefs.deviceCalendar.enabled])
  return prefs.deviceCalendar.enabled ? deviceCalendar.month(key) : undefined
}

export function useDeviceCalendarConnection() {
  const { prefs } = useDisplay()
  const { enabled, ids } = prefs.deviceCalendar
  const selected = ids.join(',')
  useEffect(() => {
    deviceCalendar.configure(enabled, selected ? selected.split(',') : [])
    if (enabled) void deviceCalendar.refresh()
  }, [enabled, selected])
  useEffect(() => onResume(() => { void deviceCalendar.refresh() }), [])
}
