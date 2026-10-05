import type { CalendarDay } from '../types/calendar.types';
import { describeCalendarDay } from './day-label.service';

type DayFields = Pick<CalendarDay, 'dayKey' | 'state' | 'figureKcal'>;

const day = (fields: DayFields): CalendarDay => {
  const grid = { dayKey: fields.dayKey, dayOfMonth: Number(fields.dayKey.slice(8)), weekdayIndex: 0, isWeekend: false };

  return fields.state === 'today' || fields.state === 'future'
    ? { ...grid, state: fields.state, figureKcal: null }
    : { ...grid, state: fields.state, figureKcal: fields.figureKcal ?? 0 };
};

describe('describeCalendarDay', () => {
  it.each([
    [day({ dayKey: '2026-10-01', state: 'on-track', figureKcal: 1200 }), 'Thursday 1 October, on track, 1200 kcal'],
    [day({ dayKey: '2026-10-02', state: 'overaten', figureKcal: 2500 }), 'Friday 2 October, over the cap, 2500 kcal'],
    [day({ dayKey: '2026-09-30', state: 'unfilled', figureKcal: 0 }), 'Wednesday 30 September, unfilled, 0 kcal'],
    [day({ dayKey: '2026-10-03', state: 'on-track', figureKcal: -300 }), 'Saturday 3 October, on track, -300 kcal'],
    [day({ dayKey: '2026-10-04', state: 'today', figureKcal: null }), 'Sunday 4 October, today'],
    [day({ dayKey: '2027-01-01', state: 'future', figureKcal: null }), 'Friday 1 January, future'],
  ])('names the date, the state and the figure of %p', (calendarDay, label) => {
    const described = describeCalendarDay(calendarDay);

    expect(described).toBe(label);
  });
});
