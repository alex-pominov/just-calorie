import type { DayLog } from '@/features/tracking';

import { monthShortName, weekStripDays, weekStripRange } from './week-strip.service';

const TODAY = '2026-10-03';

const log = (dayKey: string, overrides: Partial<DayLog> = {}): DayLog => ({
  dayKey,
  entryCount: 0,
  entriesTotalKcal: 0,
  capKcal: null,
  carryOverKcal: 0,
  carryOverAdded: null,
  totalKcal: 0,
  ...overrides,
});

const ON_TODAY = { dayKey: TODAY, todayKey: TODAY };

describe('weekStripRange', () => {
  it('runs from 13 days before today to tomorrow, 15 days in all', () => {
    expect(weekStripRange(ON_TODAY)).toEqual({ firstDayKey: '2026-09-20', lastDayKey: '2026-10-04' });
  });

  it('keeps that fortnight while the shown day has a week of it before it', () => {
    expect(weekStripRange({ dayKey: '2026-09-27', todayKey: TODAY })).toEqual({
      firstDayKey: '2026-09-20',
      lastDayKey: '2026-10-04',
    });
  });

  it('never reaches before the earliest day that can be logged, a year back', () => {
    expect(weekStripRange({ dayKey: '2025-10-05', todayKey: '2026-10-04' })).toEqual({
      firstDayKey: '2025-10-04',
      lastDayKey: '2026-10-05',
    });
  });

  it('reaches back a week before a day shown further back, and still ends on tomorrow', () => {
    expect(weekStripRange({ dayKey: '2026-08-31', todayKey: TODAY })).toEqual({
      firstDayKey: '2026-08-24',
      lastDayKey: '2026-10-04',
    });
  });
});

describe('weekStripDays', () => {
  const days = [
    log('2026-09-29', { entryCount: 1, entriesTotalKcal: 950, capKcal: 1200 }),
    log('2026-09-30', { entryCount: 1, entriesTotalKcal: 1150, capKcal: 1200 }),
    log('2026-10-01'),
    log('2026-10-02', { entryCount: 1, entriesTotalKcal: 1600, capKcal: 1200 }),
    log(TODAY, { entryCount: 3, entriesTotalKcal: 2000, capKcal: 1200 }),
    log('2026-10-04', { entryCount: 1, entriesTotalKcal: 50, capKcal: 1200 }),
  ];

  it('judges past days by the shared day-status rule and places today and tomorrow by position', () => {
    expect(weekStripDays(ON_TODAY, days).map((day) => day.variant)).toEqual([
      'on-track',
      'on-track',
      'unfilled',
      'overaten',
      'today',
      'tomorrow',
    ]);
  });

  it('labels each cell with its two-letter English weekday and day of the month, as Figma does', () => {
    expect(weekStripDays(ON_TODAY, days).map((day) => `${day.weekday} ${day.day}`)).toEqual([
      'Tu 29',
      'We 30',
      'Th 1',
      'Fr 2',
      'Sa 3',
      'Su 4',
    ]);
  });

  it('names each cell for a screen reader with its date and how the day went', () => {
    expect(weekStripDays(ON_TODAY, days).map((day) => day.accessibilityLabel)).toEqual([
      'Tuesday 29 September, on track',
      'Wednesday 30 September, on track',
      'Thursday 1 October, nothing logged',
      'Friday 2 October, over the cap',
      'Saturday 3 October, today',
      'Sunday 4 October, tomorrow',
    ]);
  });
});

describe('the selected day', () => {
  const days = [log('2026-10-01'), log('2026-10-02', { entryCount: 1, entriesTotalKcal: 1600, capKcal: 1200 }), log(TODAY), log('2026-10-04')];

  it('selects today alone while today is shown', () => {
    expect(weekStripDays(ON_TODAY, days).map((day) => day.selected)).toEqual([false, false, true, false]);
  });

  it('selects the past day shown, keeping its own state, and leaves today marked as today', () => {
    const strip = weekStripDays({ dayKey: '2026-10-02', todayKey: TODAY }, days);

    expect(strip.map((day) => [day.variant, day.selected])).toEqual([
      ['unfilled', false],
      ['overaten', true],
      ['today', false],
      ['tomorrow', false],
    ]);
  });
});

describe('monthShortName', () => {
  it.each([
    ['2026-10-03', 'Oct'],
    ['2026-01-31', 'Jan'],
    ['2026-12-01', 'Dec'],
  ])('names the month of %s as %s', (dayKey, expected) => {
    expect(monthShortName(dayKey)).toBe(expected);
  });
});
