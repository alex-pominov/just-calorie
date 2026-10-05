import { useTodayKey } from '@/features/tracking';

import { buildCalendarMonths } from '../services/calendar-model.service';
import type { CalendarMonth } from '../types/calendar.types';
import { useCalendarDays } from './useCalendarDays';

/** Every month the Calendar shows, each day in its state; null until the stored days are first read. */
export function useCalendarMonths(): readonly CalendarMonth[] | null {
  const todayKey = useTodayKey();
  const days = useCalendarDays(todayKey);

  return days === null ? null : buildCalendarMonths({ todayKey, days });
}
