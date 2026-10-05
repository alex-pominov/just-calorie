import { dayFigures, useDaySummary } from '@/features/tracking';

/** The cap a day is judged against, as the main screen shows it; null until it is read. */
export function useDayCap(dayKey: string): number | null {
  const summary = useDaySummary(dayKey);

  return summary === null ? null : (dayFigures(summary)?.capKcal ?? null);
}
