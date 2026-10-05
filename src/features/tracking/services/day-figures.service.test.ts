import type { DaySummary } from '../types/tracking.types';
import { dayFigures } from './day-figures.service';

const today = (overrides: Partial<DaySummary>): DaySummary => ({
  dayKey: '2026-10-03',
  isRecorded: true,
  capKcal: 1200,
  currentCapKcal: 1200,
  entriesTotalKcal: 0,
  carryOverKcal: 0,
  carryOverAdded: null,
  totalKcal: 0,
  ...overrides,
});

describe('dayFigures', () => {
  it.each([
    ['1:2 no data', today({ isRecorded: false, capKcal: null }), { eatenKcal: 0, leftKcal: 1200, isOverCap: false }],
    ['5:1744 data filled', today({ entriesTotalKcal: 800 }), { eatenKcal: 800, leftKcal: 400, isOverCap: false }],
    ['5:1869 over the cap', today({ entriesTotalKcal: 1600 }), { eatenKcal: 1600, leftKcal: 0, isOverCap: true }],
    [
      '5:2069 yesterday’s overage added',
      today({ carryOverKcal: 400, carryOverAdded: true }),
      { eatenKcal: 0, leftKcal: 800, isOverCap: false },
    ],
    [
      '5:2154 yesterday’s overage not added',
      today({ carryOverKcal: 400, carryOverAdded: false }),
      { eatenKcal: 0, leftKcal: 1200, isOverCap: false },
    ],
    [
      '9:4038 overage added and over the cap',
      today({ entriesTotalKcal: 1200, carryOverKcal: 400, carryOverAdded: true }),
      { eatenKcal: 1200, leftKcal: 0, isOverCap: true },
    ],
    ['exactly at the cap', today({ entriesTotalKcal: 1200 }), { eatenKcal: 1200, leftKcal: 0, isOverCap: false }],
    ['a negative net total, as stored', today({ entriesTotalKcal: -300 }), { eatenKcal: -300, leftKcal: 1500, isOverCap: false }],
    [
      'a negative net total with yesterday’s overage added',
      today({ entriesTotalKcal: -300, carryOverKcal: 400, carryOverAdded: true }),
      { eatenKcal: -300, leftKcal: 1100, isOverCap: false },
    ],
  ])('shows %s', (_frame, summary, expected) => {
    expect(dayFigures(summary)).toEqual({ ...expected, capKcal: 1200 });
  });

  it('judges a recorded day by its own cap snapshot rather than the current cap', () => {
    const pastDay = today({ capKcal: 1500, currentCapKcal: 1200, entriesTotalKcal: 1300 });

    expect(dayFigures(pastDay)).toEqual({ eatenKcal: 1300, leftKcal: 200, isOverCap: false, capKcal: 1500 });
  });

  it('computes the total from its parts, so an added carry-over counts even when a passed total says otherwise', () => {
    const staleTotal = today({ entriesTotalKcal: 1000, carryOverKcal: 400, carryOverAdded: true, totalKcal: 1000 });

    expect(dayFigures(staleTotal)).toMatchObject({ leftKcal: 0, isOverCap: true });
  });

  it('has no figures until a cap is known', () => {
    expect(dayFigures(today({ capKcal: null, currentCapKcal: null }))).toBeNull();
  });
});
