import type { GridDay, GridWeek, MonthGrid, MonthKey, WeekdayColumn } from '../types/calendar.types';

const DAYS_PER_WEEK = 7;
/** Owner default: weeks start on Monday, in `Date#getUTCDay` numbering (Sunday is 0). */
const FIRST_WEEKDAY = 1;
const SATURDAY = 6;
const SUNDAY = 0;
/** Owner default: the calendar shows this many months after the current one. */
const UPCOMING_MONTH_COUNT = 1;

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
/** In `Date#getUTCDay` order. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

interface YearMonth {
  year: number;
  /** 1 to 12. */
  month: number;
}

interface CalendarSpan {
  earliestDayKey: string | null;
  todayKey: string;
}

const pad = (value: number, length: number) => String(value).padStart(length, '0');

const toMonthKey = ({ year, month }: YearMonth): MonthKey => `${pad(year, 4)}-${pad(month, 2)}`;

function parseMonthKey(monthKey: MonthKey): YearMonth {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  const month = Number(match?.[2]);

  if (match === null || month < 1 || month > 12) {
    throw new Error('A month key must be a calendar month written YYYY-MM');
  }

  return { year: Number(match[1]), month };
}

// Calendar arithmetic runs in UTC, where no day is skipped or repeated by a daylight-saving change.
const utcWeekdayOf = ({ year, month }: YearMonth, dayOfMonth: number) =>
  new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();

const daysInMonth = ({ year, month }: YearMonth) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function weekdayName(utcWeekday: number): string {
  const name = WEEKDAY_NAMES[utcWeekday];

  if (name === undefined) {
    throw new Error('A weekday runs from 0 to 6');
  }

  return name;
}

const isWeekendDay = (utcWeekday: number) => utcWeekday === SATURDAY || utcWeekday === SUNDAY;

const columnOf = (utcWeekday: number) => (utcWeekday - FIRST_WEEKDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;

function toWeeks<TDay>(cells: readonly (TDay | null)[]): GridWeek<TDay>[] {
  const weeks: GridWeek<TDay>[] = [];

  for (let start = 0; start < cells.length; start += DAYS_PER_WEEK) {
    weeks.push(cells.slice(start, start + DAYS_PER_WEEK));
  }

  return weeks;
}

/** The grid's column headings, in the order the week starts. */
export const WEEKDAY_COLUMNS: readonly WeekdayColumn[] = Array.from({ length: DAYS_PER_WEEK }, (_, column) => {
  const utcWeekday = (column + FIRST_WEEKDAY) % DAYS_PER_WEEK;

  return { label: weekdayName(utcWeekday).slice(0, 2), isWeekend: isWeekendDay(utcWeekday) };
});

export function weekdayNameOf(dayKey: string): string {
  return weekdayName(utcWeekdayOf(parseMonthKey(monthKeyOf(dayKey)), Number(dayKey.slice(8))));
}

export function monthKeyOf(dayKey: string): MonthKey {
  return dayKey.slice(0, 7);
}

export function nextMonthKey(monthKey: MonthKey): MonthKey {
  const { year, month } = parseMonthKey(monthKey);

  return month === 12 ? toMonthKey({ year: year + 1, month: 1 }) : toMonthKey({ year, month: month + 1 });
}

export function lastDayKeyOf(monthKey: MonthKey): string {
  const yearMonth = parseMonthKey(monthKey);

  return `${toMonthKey(yearMonth)}-${pad(daysInMonth(yearMonth), 2)}`;
}

export function monthName(monthKey: MonthKey): string {
  const name = MONTH_NAMES[parseMonthKey(monthKey).month - 1];

  if (name === undefined) {
    throw new Error('A month runs from 1 to 12');
  }

  return name;
}

/** Owner answer (calendar request [3]): a month outside the current year carries its year, as 'October 2025'. */
export function monthTitle(monthKey: MonthKey, currentMonthKey: MonthKey): string {
  const { year } = parseMonthKey(monthKey);

  return year === parseMonthKey(currentMonthKey).year ? monthName(monthKey) : `${monthName(monthKey)} ${year}`;
}

export function buildMonthGrid(monthKey: MonthKey): MonthGrid {
  const yearMonth = parseMonthKey(monthKey);
  const normalisedKey = toMonthKey(yearMonth);
  const cells: (GridDay | null)[] = Array.from({ length: columnOf(utcWeekdayOf(yearMonth, 1)) }, () => null);

  for (let dayOfMonth = 1; dayOfMonth <= daysInMonth(yearMonth); dayOfMonth += 1) {
    const utcWeekday = utcWeekdayOf(yearMonth, dayOfMonth);

    cells.push({
      dayKey: `${normalisedKey}-${pad(dayOfMonth, 2)}`,
      dayOfMonth,
      weekdayIndex: columnOf(utcWeekday),
      isWeekend: isWeekendDay(utcWeekday),
    });
  }

  return { monthKey: normalisedKey, ...yearMonth, weeks: toWeeks(cells) };
}

function firstCalendarMonthKey({ earliestDayKey, todayKey }: CalendarSpan): MonthKey {
  const currentMonth = monthKeyOf(todayKey);
  const earliestMonth = earliestDayKey === null ? currentMonth : monthKeyOf(earliestDayKey);

  return earliestMonth < currentMonth ? earliestMonth : currentMonth;
}

function lastCalendarMonthKey(todayKey: string): MonthKey {
  let monthKey = monthKeyOf(todayKey);

  for (let count = 0; count < UPCOMING_MONTH_COUNT; count += 1) {
    monthKey = nextMonthKey(monthKey);
  }

  return monthKey;
}

/** The first day the calendar shows: the 1st of its first month. */
export function firstCalendarDayKey(span: CalendarSpan): string {
  return `${firstCalendarMonthKey(span)}-01`;
}

/** Owner default: from the earliest recorded month (or the current one) through the upcoming months. */
export function calendarMonthKeys(span: CalendarSpan): MonthKey[] {
  const lastMonth = lastCalendarMonthKey(span.todayKey);
  const monthKeys: MonthKey[] = [];
  let monthKey = firstCalendarMonthKey(span);

  while (monthKey <= lastMonth) {
    monthKeys.push(monthKey);
    monthKey = nextMonthKey(monthKey);
  }

  return monthKeys;
}
