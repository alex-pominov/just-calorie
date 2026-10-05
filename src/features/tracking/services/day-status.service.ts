import type { DayLog, DayStatus } from '../types/day-log.types';
import { dayTotalKcal } from './carry-over.service';

/** The one rule for how a stored past day went; the main screen and the calendar both read it. */
export function dayStatus(
  day: Pick<DayLog, 'entryCount' | 'entriesTotalKcal' | 'carryOverKcal' | 'carryOverAdded' | 'capKcal'>,
): DayStatus {
  if (day.entryCount === 0) {
    return 'unfilled';
  }

  if (day.capKcal === null) {
    return 'on-track';
  }

  return dayTotalKcal(day) > day.capKcal ? 'overaten' : 'on-track';
}
