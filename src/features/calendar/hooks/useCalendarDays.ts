// The calendar's one seam to tracking: nothing else in the feature reads stored days or judges one.
import type { DayLog } from '@/features/tracking';
import { dayStatus, useDaySummaries, useEarliestDayKey } from '@/features/tracking';

import { firstCalendarDayKey } from '../services/month-grid.service';
import type { CalendarDayRecord, CalendarDays } from '../types/calendar.types';

// Backlog 20: the calendar shows and judges what was eaten, so an added carry-over is left out of both.
const toEatenRecord = (day: DayLog): CalendarDayRecord => ({
  status: dayStatus({ ...day, carryOverAdded: false }),
  eatenKcal: day.entriesTotalKcal,
});

/** Every day from the 1st of the first month shown through today, judged; null until both reads land. */
export function useCalendarDays(todayKey: string): CalendarDays | null {
  const earliest = useEarliestDayKey();
  const earliestDayKey = earliest?.earliestDayKey ?? null;
  const days = useDaySummaries({ firstDayKey: firstCalendarDayKey({ earliestDayKey, todayKey }), lastDayKey: todayKey });

  if (earliest === null || days === null) {
    return null;
  }

  return {
    earliestDayKey,
    byDayKey: new Map(days.map((day) => [day.dayKey, toEatenRecord(day)])),
  };
}
