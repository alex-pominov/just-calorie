import type { DayStatus } from '@/features/tracking';

/** How a past day went, by tracking's one rule (acceptance [1]). */
export type { DayStatus };

/** A status, unless the day's position decides first: the current day is today, a later one is future. */
export type CalendarDayState = DayStatus | 'today' | 'future';

/** One recorded day as the calendar consumes it, whatever the read that produced it. */
export interface CalendarDayRecord {
  status: DayStatus;
  totalKcal: number;
}

/** Every recorded day the calendar shows, and the earliest of them, which starts the month range. */
export interface CalendarDays {
  earliestDayKey: string | null;
  byDayKey: ReadonlyMap<string, CalendarDayRecord>;
}

/** `YYYY-MM`. */
export type MonthKey = string;

export interface GridDay {
  dayKey: string;
  dayOfMonth: number;
  /** 0 is the first column of the week. */
  weekdayIndex: number;
  isWeekend: boolean;
}

export interface WeekdayColumn {
  /** Two letters, as the frame heads its columns. */
  label: string;
  isWeekend: boolean;
}

/** A week row; null is a placeholder before the month's first day. */
export type GridWeek<Day> = readonly (Day | null)[];

export interface MonthGrid {
  monthKey: MonthKey;
  year: number;
  /** 1 to 12. */
  month: number;
  weeks: readonly GridWeek<GridDay>[];
}

/** A day up to yesterday, which shows a figure under its number. */
export interface JudgedCalendarDay extends GridDay {
  state: DayStatus;
  figureKcal: number;
}

/** Today or a later day, which shows its number alone. */
export interface PlainCalendarDay extends GridDay {
  state: 'today' | 'future';
  figureKcal: null;
}

export type CalendarDay = JudgedCalendarDay | PlainCalendarDay;

/** Where a month sits relative to today's. */
export type MonthPosition = 'past' | 'current' | 'upcoming';

export interface CalendarMonth {
  monthKey: MonthKey;
  title: string;
  position: MonthPosition;
  weeks: readonly GridWeek<CalendarDay>[];
}
