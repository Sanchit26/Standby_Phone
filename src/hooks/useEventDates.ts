import { useCallback } from 'react'
import { useQuery } from './useQuery'
import { eventDatesInMonth } from '../storage/calendar'
import { db } from '../storage/database'

export function useEventDates(year: number, month: number) {
  return useQuery(useCallback(() => eventDatesInMonth(db, year, month), [year, month]))
}
