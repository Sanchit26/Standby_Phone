import { useCallback, useMemo } from 'react'
import { useQuery } from './useQuery'
import { eventDatesInMonth } from '../storage/calendar'
import { db } from '../storage/database'
import { mergeEventDates } from '../storage/calendarView'
import { useDeviceMonth } from './useDeviceCalendar'

export function useEventDates(year: number, month: number) {
  const local = useQuery(useCallback(() => eventDatesInMonth(db, year, month), [year, month]))
  const device = useDeviceMonth(year, month)
  return useMemo(() => ({ data: mergeEventDates(local.data, device), error: local.error }), [local.data, local.error, device])
}
