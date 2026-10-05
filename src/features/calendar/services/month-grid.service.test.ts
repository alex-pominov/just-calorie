import {
  buildMonthGrid,
  calendarMonthKeys,
  firstCalendarDayKey,
  lastDayKeyOf,
  monthKeyOf,
  WEEKDAY_COLUMNS,
  monthTitle,
  nextMonthKey,
} from './month-grid.service';

const dayNumbers = (monthKey: string) =>
  buildMonthGrid(monthKey).weeks.map((week) => week.map((day) => (day === null ? null : day.dayOfMonth)));

describe('buildMonthGrid', () => {
  it('starts a month whose first day is a Monday in the first column with no placeholders', () => {
    const weeks = dayNumbers('2026-06');

    expect(weeks).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14],
      [15, 16, 17, 18, 19, 20, 21],
      [22, 23, 24, 25, 26, 27, 28],
      [29, 30],
    ]);
  });

  it('puts six placeholders before a month whose first day is a Sunday', () => {
    const weeks = dayNumbers('2026-11');

    expect(weeks[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(weeks[1]).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(weeks.at(-1)).toEqual([30]);
  });

  it('gives February 2028 its leap day and February 2027 twenty-eight days', () => {
    const leap = dayNumbers('2028-02');
    const common = dayNumbers('2027-02');

    expect(leap).toEqual([
      [null, 1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12, 13],
      [14, 15, 16, 17, 18, 19, 20],
      [21, 22, 23, 24, 25, 26, 27],
      [28, 29],
    ]);
    expect(common).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [8, 9, 10, 11, 12, 13, 14],
      [15, 16, 17, 18, 19, 20, 21],
      [22, 23, 24, 25, 26, 27, 28],
    ]);
  });

  it('keeps every day of a month with a daylight-saving change once, in its own column', () => {
    const grid = buildMonthGrid('2026-03');

    const days = grid.weeks.flat().filter((day) => day !== null);

    expect(days.map((day) => day.dayKey)).toEqual(
      Array.from({ length: 31 }, (_, index) => `2026-03-${String(index + 1).padStart(2, '0')}`),
    );
    expect(grid.weeks[1]?.map((day) => day?.dayOfMonth)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(grid.weeks[2]?.map((day) => day?.dayOfMonth)).toEqual([9, 10, 11, 12, 13, 14, 15]);
  });

  it('flags only the Saturday and Sunday columns as the weekend', () => {
    const grid = buildMonthGrid('2026-06');

    const firstWeek = grid.weeks[0] ?? [];

    expect(firstWeek.map((day) => day?.isWeekend)).toEqual([false, false, false, false, false, true, true]);
    expect(firstWeek.map((day) => day?.weekdayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('describes the month it was built for', () => {
    const grid = buildMonthGrid('2026-10');

    expect(grid).toMatchObject({ monthKey: '2026-10', year: 2026, month: 10 });
    expect(grid.weeks[0]?.[3]).toEqual({ dayKey: '2026-10-01', dayOfMonth: 1, weekdayIndex: 3, isWeekend: false });
  });
});

describe('WEEKDAY_COLUMNS', () => {
  it('heads the columns Monday to Sunday, with Saturday and Sunday as the weekend', () => {
    const columns = WEEKDAY_COLUMNS.map((column) => [column.label, column.isWeekend]);

    expect(columns).toEqual([
      ['Mo', false],
      ['Tu', false],
      ['We', false],
      ['Th', false],
      ['Fr', false],
      ['Sa', true],
      ['Su', true],
    ]);
  });
});

describe('month keys', () => {
  it('reads the month of a day key', () => {
    const monthKey = monthKeyOf('2026-10-04');

    expect(monthKey).toBe('2026-10');
  });

  it('moves from December to the January of the next year', () => {
    const next = nextMonthKey('2026-12');

    expect(next).toBe('2027-01');
  });

  it('names the last day of each month, leap February included', () => {
    const lastDays = ['2026-10', '2026-11', '2027-02', '2028-02', '2026-12'].map(lastDayKeyOf);

    expect(lastDays).toEqual(['2026-10-31', '2026-11-30', '2027-02-28', '2028-02-29', '2026-12-31']);
  });

  it('titles a month of the current year by its English name alone', () => {
    const titles = ['2026-01', '2026-10', '2026-12'].map((monthKey) => monthTitle(monthKey, '2026-10'));

    expect(titles).toEqual(['January', 'October', 'December']);
  });

  it('adds the year to the title of a month outside the current year, before or after it', () => {
    const titles = ['2025-10', '2025-12', '2027-01'].map((monthKey) => monthTitle(monthKey, '2026-10'));

    expect(titles).toEqual(['October 2025', 'December 2025', 'January 2027']);
  });
});

describe('calendarMonthKeys', () => {
  it('runs from the earliest recorded month through the current month and one upcoming month', () => {
    const months = calendarMonthKeys({ earliestDayKey: '2026-07-18', todayKey: '2026-10-04' });

    expect(months).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  });

  it('shows the current month and the upcoming one when nothing is recorded', () => {
    const months = calendarMonthKeys({ earliestDayKey: null, todayKey: '2026-10-04' });

    expect(months).toEqual(['2026-10', '2026-11']);
  });

  it('crosses the year boundary from December into January', () => {
    const months = calendarMonthKeys({ earliestDayKey: '2026-11-30', todayKey: '2026-12-15' });

    expect(months).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('starts reading at the 1st of the first month it shows', () => {
    const firstDays = [
      firstCalendarDayKey({ earliestDayKey: '2026-07-18', todayKey: '2026-10-04' }),
      firstCalendarDayKey({ earliestDayKey: null, todayKey: '2026-10-04' }),
      firstCalendarDayKey({ earliestDayKey: '2026-11-02', todayKey: '2026-10-04' }),
    ];

    expect(firstDays).toEqual(['2026-07-01', '2026-10-01', '2026-10-01']);
  });

  it('still starts at the current month when the earliest recorded day is later than today', () => {
    const months = calendarMonthKeys({ earliestDayKey: '2026-11-02', todayKey: '2026-10-04' });

    expect(months).toEqual(['2026-10', '2026-11']);
  });
});
