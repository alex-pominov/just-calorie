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
