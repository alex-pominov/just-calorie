import type { DayLog } from '../types/day-log.types';
import { dayStatus } from './day-status.service';

// What the multi-day read returns for a day nobody has written to.
const absentDay: DayLog = {
  dayKey: '2026-10-01',
  entryCount: 0,
  entriesTotalKcal: 0,
  capKcal: null,
  carryOverKcal: 0,
  carryOverAdded: null,
  totalKcal: 0,
};

const day = (overrides: Partial<DayLog>): DayLog => ({ ...absentDay, capKcal: 1200, ...overrides });

describe('dayStatus', () => {
  it('calls a day absent from storage unfilled', () => {
    expect(dayStatus(absentDay)).toBe('unfilled');
  });

  it('calls a day with only a carry-over decision unfilled, even when the added carry-over is over the cap', () => {
    const decisionOnly = day({ entryCount: 0, carryOverKcal: 1500, carryOverAdded: true });

    expect(dayStatus(decisionOnly)).toBe('unfilled');
  });

  it.each([
    ['under the cap', day({ entryCount: 2, entriesTotalKcal: 800 })],
    ['exactly at the cap', day({ entryCount: 1, entriesTotalKcal: 1200 })],
    ['net zero with entry rows present', day({ entryCount: 2, entriesTotalKcal: 0 })],
    ['net negative with entry rows present', day({ entryCount: 2, entriesTotalKcal: -300 })],
    ['a withheld carry-over that would have gone over', day({ entryCount: 1, entriesTotalKcal: 1000, carryOverKcal: 300, carryOverAdded: false })],
    ['no cap snapshot, whatever the total', day({ entryCount: 1, entriesTotalKcal: 5000, capKcal: null })],
  ])('calls a day with entries on-track: %s', (_case, input) => {
    expect(dayStatus(input)).toBe('on-track');
  });

  it.each([
    ['entries above the cap snapshot', day({ entryCount: 3, entriesTotalKcal: 1201 })],
    ['an added carry-over taking entries over the cap', day({ entryCount: 1, entriesTotalKcal: 1000, carryOverKcal: 300, carryOverAdded: true })],
  ])('calls a day with entries overaten: %s', (_case, input) => {
    expect(dayStatus(input)).toBe('overaten');
  });

  it('judges a day by its own cap snapshot, from its parts rather than a passed-in total', () => {
    const staleTotal = day({ entryCount: 1, entriesTotalKcal: 1300, totalKcal: 0 });

    expect(dayStatus(staleTotal)).toBe('overaten');
  });
});
