import type {
  CalendarDay,
  CalendarDayRecord,
  CalendarDays,
  CalendarMonth,
  GridDay,
  MonthKey,
  MonthPosition,
} from '../types/calendar.types';
import { deriveCalendarDayState } from './day-state.service';
import { buildMonthGrid, calendarMonthKeys, monthKeyOf, monthTitle } from './month-grid.service';

interface CalendarInput {
  todayKey: string;
  days: CalendarDays;
}

// A day nobody wrote to has no entry rows, which acceptance [1] calls unfilled.
const UNRECORDED_DAY: CalendarDayRecord = { status: 'unfilled', totalKcal: 0 };

function toCalendarDay(day: GridDay, { todayKey, days }: CalendarInput): CalendarDay {
  const record = days.byDayKey.get(day.dayKey) ?? UNRECORDED_DAY;
  const state = deriveCalendarDayState({ dayKey: day.dayKey, todayKey, status: record.status });

  if (state === 'today' || state === 'future') {
    return { ...day, state, figureKcal: null };
  }

  // Owner default (request [1]): every past day shows its stored total, unclamped; the state dims an unfilled one.
  return { ...day, state, figureKcal: record.totalKcal };
}

function positionOf(monthKey: MonthKey, currentMonth: MonthKey): MonthPosition {
  if (monthKey === currentMonth) {
    return 'current';
  }

  return monthKey > currentMonth ? 'upcoming' : 'past';
}

export function buildCalendarMonths(input: CalendarInput): CalendarMonth[] {
  const currentMonth = monthKeyOf(input.todayKey);

  return calendarMonthKeys({ earliestDayKey: input.days.earliestDayKey, todayKey: input.todayKey }).map((monthKey) => ({
    monthKey,
    title: monthTitle(monthKey, currentMonth),
    position: positionOf(monthKey, currentMonth),
    weeks: buildMonthGrid(monthKey).weeks.map((week) => week.map((day) => (day === null ? null : toCalendarDay(day, input)))),
  }));
}
