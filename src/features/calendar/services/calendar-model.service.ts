import type {
  CalendarDay,
  CalendarDayRecord,
  CalendarDays,
  CalendarMonth,
  CalendarWeek,
  GridDay,
  GridWeek,
  MonthKey,
  MonthPosition,
} from '../types/calendar.types';
import { deriveCalendarDayState } from './day-state.service';
import { buildMonthGrid, calendarMonthKeys, monthKeyOf, monthTitle, weekDayKeysOf } from './month-grid.service';

interface CalendarInput {
  todayKey: string;
  days: CalendarDays;
}

// A day nobody wrote to has no entry rows, which acceptance [1] calls unfilled.
const UNRECORDED_DAY: CalendarDayRecord = { status: 'unfilled', eatenKcal: 0 };

function toCalendarDay(day: GridDay, { todayKey, days }: CalendarInput): CalendarDay {
  const record = days.byDayKey.get(day.dayKey) ?? UNRECORDED_DAY;
  const state = deriveCalendarDayState({ dayKey: day.dayKey, todayKey, status: record.status });

  if (state === 'today' || state === 'future') {
    return { ...day, state, figureKcal: null };
  }

  // Every past day shows what was eaten, unclamped (backlog 20); the state dims an unfilled one.
  return { ...day, state, figureKcal: record.eatenKcal };
}

/** Backlog 20 rule (b): the mean eaten over the week's days before today that have entries, rounded; null without one. */
function weekAverageKcal(week: GridWeek<GridDay>, { todayKey, days }: CalendarInput): number | null {
  const anyDay = week.find((day): day is GridDay => day !== null);

  if (anyDay === undefined) {
    return null;
  }

  let eatenKcal = 0;
  let counted = 0;

  for (const dayKey of weekDayKeysOf(anyDay)) {
    const record = days.byDayKey.get(dayKey);

    if (dayKey < todayKey && record !== undefined && record.status !== 'unfilled') {
      eatenKcal += record.eatenKcal;
      counted += 1;
    }
  }

  return counted === 0 ? null : Math.round(eatenKcal / counted);
}

const toCalendarWeek = (week: GridWeek<GridDay>, input: CalendarInput): CalendarWeek => ({
  days: week.map((day) => (day === null ? null : toCalendarDay(day, input))),
  averageKcal: weekAverageKcal(week, input),
});

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
    weeks: buildMonthGrid(monthKey).weeks.map((week) => toCalendarWeek(week, input)),
  }));
}
