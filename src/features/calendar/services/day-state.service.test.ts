import type { DayStatus } from '../types/calendar.types';
import { deriveCalendarDayState } from './day-state.service';

const TODAY = '2026-10-04';
const STATUSES: DayStatus[] = ['unfilled', 'on-track', 'overaten'];

describe('deriveCalendarDayState', () => {
  it.each(STATUSES)('shows a past %s day by its status', (status) => {
    const state = deriveCalendarDayState({ dayKey: '2026-10-03', todayKey: TODAY, status });

    expect(state).toBe(status);
  });

  it.each(STATUSES)('shows the current day as today whatever its status (%s)', (status) => {
    const state = deriveCalendarDayState({ dayKey: TODAY, todayKey: TODAY, status });

    expect(state).toBe('today');
  });

  it.each(STATUSES)('shows a day after today as future whatever its status (%s)', (status) => {
    const states = ['2026-10-05', '2026-11-01', '2027-01-01'].map((dayKey) =>
      deriveCalendarDayState({ dayKey, todayKey: TODAY, status }),
    );

    expect(states).toEqual(['future', 'future', 'future']);
  });

  it('orders days across a year boundary by date', () => {
    const states = ['2025-12-31', '2027-01-01'].map((dayKey) =>
      deriveCalendarDayState({ dayKey, todayKey: '2026-01-01', status: 'on-track' }),
    );

    expect(states).toEqual(['on-track', 'future']);
  });
});
