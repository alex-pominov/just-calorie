import type { CalendarDay, CalendarDayRecord, CalendarDays, CalendarMonth } from '../types/calendar.types';
import { buildCalendarMonths } from './calendar-model.service';

const TODAY = '2026-10-04';

const daysOf = (records: Record<string, CalendarDayRecord>): CalendarDays => {
  const byDayKey = new Map(Object.entries(records));
  const earliestDayKey = [...byDayKey.keys()].toSorted()[0] ?? null;

  return { earliestDayKey, byDayKey };
};

const dayIn = (months: readonly CalendarMonth[], dayKey: string): CalendarDay | undefined =>
  months
    .flatMap((month) => month.weeks.flat())
    .find((day): day is CalendarDay => day !== null && day.dayKey === dayKey);

describe('buildCalendarMonths', () => {
  it('lays out the earliest recorded month through the upcoming one, each placed relative to today’s month', () => {
    const months = buildCalendarMonths({
      todayKey: TODAY,
      days: daysOf({ '2026-08-20': { status: 'on-track', totalKcal: 1200 } }),
    });

    expect(months.map((month) => [month.monthKey, month.title, month.position])).toEqual([
      ['2026-08', 'August', 'past'],
      ['2026-09', 'September', 'past'],
      ['2026-10', 'October', 'current'],
      ['2026-11', 'November', 'upcoming'],
    ]);
  });

  it('titles the months of an earlier year with their year and this year’s by name alone', () => {
    const months = buildCalendarMonths({
      todayKey: '2026-01-04',
      days: daysOf({ '2025-11-20': { status: 'on-track', totalKcal: 1200 } }),
    });

    expect(months.map((month) => month.title)).toEqual(['November 2025', 'December 2025', 'January', 'February']);
  });

  it('titles an upcoming month in the next year with its year', () => {
    const months = buildCalendarMonths({ todayKey: '2026-12-15', days: daysOf({}) });

    expect(months.map((month) => month.title)).toEqual(['December', 'January 2027']);
  });

  it('shows each past day in its status with its total as the figure, a negative total unclamped', () => {
    const months = buildCalendarMonths({
      todayKey: TODAY,
      days: daysOf({
        '2026-10-01': { status: 'on-track', totalKcal: 1200 },
        '2026-10-02': { status: 'overaten', totalKcal: 2500 },
        '2026-10-03': { status: 'on-track', totalKcal: -300 },
      }),
    });

    const shown = ['2026-10-01', '2026-10-02', '2026-10-03'].map((dayKey) => dayIn(months, dayKey));

    expect(shown.map((day) => [day?.state, day?.figureKcal])).toEqual([
      ['on-track', 1200],
      ['overaten', 2500],
      ['on-track', -300],
    ]);
  });

  it('shows an unfilled past day with its stored total: 0 with no row, its added carry-over without entries', () => {
    const months = buildCalendarMonths({
      todayKey: TODAY,
      days: daysOf({ '2026-09-30': { status: 'unfilled', totalKcal: 300 } }),
    });

    const shown = ['2026-09-30', '2026-09-29'].map((dayKey) => dayIn(months, dayKey));

    expect(shown.map((day) => [day?.state, day?.figureKcal])).toEqual([
      ['unfilled', 300],
      ['unfilled', 0],
    ]);
  });

  it('shows today and every later day with no figure, whatever is stored for them', () => {
    const months = buildCalendarMonths({
      todayKey: TODAY,
      days: daysOf({
        '2026-10-04': { status: 'overaten', totalKcal: 2500 },
        '2026-10-05': { status: 'on-track', totalKcal: 800 },
      }),
    });

    const shown = ['2026-10-04', '2026-10-05', '2026-10-31', '2026-11-15'].map((dayKey) => dayIn(months, dayKey));

    expect(shown.map((day) => [day?.state, day?.figureKcal])).toEqual([
      ['today', null],
      ['future', null],
      ['future', null],
      ['future', null],
    ]);
  });

  it('keeps the placeholders before each month’s first day', () => {
    const months = buildCalendarMonths({ todayKey: TODAY, days: daysOf({}) });

    const october = months[0];

    expect(october?.weeks[0]?.map((day) => day?.dayOfMonth ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
  });
});
