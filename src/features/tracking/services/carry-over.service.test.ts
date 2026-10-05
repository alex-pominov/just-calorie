import type { RecordedDay } from '../types/tracking.types';
import { computeCarryOverKcal, dayTotalKcal } from './carry-over.service';

const recordedDay = (overrides: Partial<RecordedDay>): RecordedDay => ({
  capKcal: 2000,
  entriesTotalKcal: 0,
  carryOverKcal: 0,
  carryOverAdded: null,
  ...overrides,
});

describe('computeCarryOverKcal', () => {
  it('carries nothing when there is no previous day', () => {
    const carryOver = computeCarryOverKcal(null);

    expect(carryOver).toBe(0);
  });

  it('carries nothing when the previous day had no cap', () => {
    const carryOver = computeCarryOverKcal(recordedDay({ capKcal: null, entriesTotalKcal: 3000 }));

    expect(carryOver).toBe(0);
  });

  it.each([1800, 2000])('carries nothing when the previous day ate %p kcal against a 2000 cap', (entriesTotalKcal) => {
    const carryOver = computeCarryOverKcal(recordedDay({ entriesTotalKcal }));

    expect(carryOver).toBe(0);
  });

  it('carries the amount the previous day went over its cap', () => {
    const carryOver = computeCarryOverKcal(recordedDay({ entriesTotalKcal: 2300 }));

    expect(carryOver).toBe(300);
  });

  it('chains the previous day’s own carry-over when that day added it', () => {
    const carryOver = computeCarryOverKcal(
      recordedDay({ entriesTotalKcal: 1900, carryOverKcal: 300, carryOverAdded: true }),
    );

    expect(carryOver).toBe(200);
  });

  it.each([false, null])('ignores the previous day’s carry-over when its decision was %p', (carryOverAdded) => {
    const carryOver = computeCarryOverKcal(
      recordedDay({ entriesTotalKcal: 1900, carryOverKcal: 300, carryOverAdded }),
    );

    expect(carryOver).toBe(0);
  });
});

describe('dayTotalKcal', () => {
  it('adds the carry-over to the entries only once the user added it', () => {
    const day = recordedDay({ entriesTotalKcal: 1200, carryOverKcal: 300 });

    const totals = [null, false, true].map((carryOverAdded) => dayTotalKcal({ ...day, carryOverAdded }));

    expect(totals).toEqual([1200, 1200, 1500]);
  });
});
