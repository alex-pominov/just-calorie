import type { CalendarDay, CalendarDayState } from '../types/calendar.types';
import { monthKeyOf, monthName, weekdayNameOf } from './month-grid.service';

const STATE_NAMES = {
  'on-track': 'on track',
  overaten: 'over the cap',
  unfilled: 'unfilled',
  today: 'today',
  future: 'future',
} as const satisfies Record<CalendarDayState, string>;

/** What a screen reader says for a day: its date, its state and, where the cell shows one, its figure. */
export function describeCalendarDay({ dayKey, dayOfMonth, state, figureKcal }: CalendarDay): string {
  const date = `${weekdayNameOf(dayKey)} ${dayOfMonth} ${monthName(monthKeyOf(dayKey))}`;
  const described = `${date}, ${STATE_NAMES[state]}`;

  return figureKcal === null ? described : `${described}, ${figureKcal} kcal`;
}

/** What a screen reader says for a week's average, which shows only where the week has one. */
export function describeWeekAverage(averageKcal: number): string {
  return `Week average, ${averageKcal} kcal`;
}
