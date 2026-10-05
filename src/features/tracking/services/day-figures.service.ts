import type { DayFigures, DaySummary } from '../types/tracking.types';
import { dayTotalKcal } from './carry-over.service';

/** A day's figures, as stored and as the calendar shows them; null until a cap is known. */
export function dayFigures(
  summary: Pick<DaySummary, 'capKcal' | 'currentCapKcal' | 'entriesTotalKcal' | 'carryOverKcal' | 'carryOverAdded'>,
): DayFigures | null {
  const capKcal = summary.capKcal ?? summary.currentCapKcal;

  if (capKcal === null) {
    return null;
  }

  const totalKcal = dayTotalKcal(summary);

  return {
    eatenKcal: summary.entriesTotalKcal,
    leftKcal: Math.max(0, capKcal - totalKcal),
    capKcal,
    isOverCap: totalKcal > capKcal,
  };
}
