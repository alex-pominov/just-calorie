import {
  earliestLoggableDayKey,
  InvalidDayKeyError,
  loggableDayKey,
  millisecondsUntilNextDay,
  previousDayKey,
  shiftDayKey,
  toDayKey,
} from './day-key.service';

describe('toDayKey', () => {
  it('runs where the local and UTC calendar days differ just before midnight, so the cases below can fail', () => {
    const lastLocalInstant = new Date(2026, 9, 4, 23, 59, 59, 999);

    expect(lastLocalInstant.toISOString().slice(0, 10)).not.toBe('2026-10-04');
  });

  it('keeps the last instant before local midnight on that calendar day', () => {
    const dayKey = toDayKey(new Date(2026, 9, 4, 23, 59, 59, 999));

    expect(dayKey).toBe('2026-10-04');
  });

  it('moves to the next calendar day at local midnight', () => {
    const dayKey = toDayKey(new Date(2026, 9, 5, 0, 0));

    expect(dayKey).toBe('2026-10-05');
  });

  it('zero-pads a single-digit month and day', () => {
    const dayKey = toDayKey(new Date(2026, 0, 5, 12, 0));

    expect(dayKey).toBe('2026-01-05');
  });
});

describe('previousDayKey', () => {
  it.each([
    ['2026-10-05', '2026-10-04'],
    ['2026-03-01', '2026-02-28'],
    ['2028-03-01', '2028-02-29'],
    ['2026-01-01', '2025-12-31'],
  ])('steps back from %s to %s across month, leap-day and year boundaries', (dayKey, expected) => {
    const previous = previousDayKey(dayKey);

    expect(previous).toBe(expected);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-1-05', '2026-10-04T10:00', ''])(
    'rejects the malformed day key %p',
    (dayKey) => {
      const attempt = () => previousDayKey(dayKey);

      expect(attempt).toThrow(InvalidDayKeyError);
    },
  );
});

describe('shiftDayKey', () => {
  it.each([
    ['2026-10-04', 1, '2026-10-05'],
    ['2026-10-04', -13, '2026-09-21'],
    ['2026-10-04', 0, '2026-10-04'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-11-01', 1, '2026-11-02'],
    ['2026-03-08', -1, '2026-03-07'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
  ])('moves %s by %p days to %s, across month ends and clock changes', (dayKey, days, expected) => {
    expect(shiftDayKey(dayKey, days)).toBe(expected);
  });

  it.each(['2026-02-30', '04/10/2026'])('refuses the malformed day key %p with InvalidDayKeyError', (dayKey) => {
    expect(() => shiftDayKey(dayKey, 1)).toThrow(InvalidDayKeyError);
  });

  it('refuses a fractional number of days', () => {
    expect(() => shiftDayKey('2026-10-04', 0.5)).toThrow(RangeError);
  });
});

describe('millisecondsUntilNextDay', () => {
  it('counts down to the next local midnight', () => {
    const remaining = millisecondsUntilNextDay(new Date(2026, 6, 15, 23, 59, 30));

    expect(remaining).toBe(30_000);
  });
});

describe('loggableDayKey', () => {
  const TODAY = '2026-10-04';

  it.each([
    ['2026-10-03', '2026-10-03'],
    ['2025-12-31', '2025-12-31'],
    ['2025-10-04', '2025-10-04'],
    [TODAY, TODAY],
  ])('writes to the day %p a link names, when it is today or up to a year before it', (param, expected) => {
    expect(loggableDayKey(param, TODAY)).toBe(expected);
  });

  it.each([
    ['tomorrow', '2026-10-05'],
    ['a day more than a year back', '2025-10-03'],
    ['the earliest date a key can spell', '0000-01-01'],
    ['a malformed date', '2026-02-30'],
    ['another format', '04/10/2026'],
    ['an empty value', ''],
    ['a repeated parameter', ['2026-10-03', '2026-10-02']],
    ['no parameter', undefined],
  ])('writes to today for %s', (_label, param) => {
    expect(loggableDayKey(param, TODAY)).toBe(TODAY);
  });
});

describe('earliestLoggableDayKey', () => {
  it.each([
    ['2026-10-04', '2025-10-04'],
    ['2028-03-01', '2027-03-02'],
  ])('reaches 365 days back from %s, to %s', (todayKey, expected) => {
    expect(earliestLoggableDayKey(todayKey)).toBe(expected);
  });
});
