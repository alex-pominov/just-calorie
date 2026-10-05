import type { DayFigures } from '@/features/tracking';

/** What the bowl shows, as one sentence for a screen reader. */
export function bowlLabel(figures: DayFigures, addedCarryOverKcal: number): string {
  const carried = addedCarryOverKcal > 0 ? ` and ${addedCarryOverKcal} kcal carried over` : '';
  const over = figures.isOverCap ? ': over the cap' : '';

  return `${figures.eatenKcal} kcal eaten${carried}, against a ${figures.capKcal} kcal cap${over}`;
}
