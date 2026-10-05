import type { RecordedDay } from '../types/tracking.types';

export function dayTotalKcal(day: Omit<RecordedDay, 'capKcal'>): number {
  return day.entriesTotalKcal + (day.carryOverAdded === true ? day.carryOverKcal : 0);
}

export function computeCarryOverKcal(previousDay: RecordedDay | null): number {
  if (previousDay === null || previousDay.capKcal === null) {
    return 0;
  }

  return Math.max(0, dayTotalKcal(previousDay) - previousDay.capKcal);
}
