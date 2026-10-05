import { InvalidDayKeyError } from './day-key.service';
import { dateName } from './date-name.service';

describe('dateName', () => {
  it.each([
    ['2026-10-02', 'Friday 2 October'],
    ['2026-09-29', 'Tuesday 29 September'],
    ['2028-02-29', 'Tuesday 29 February'],
    ['2027-01-03', 'Sunday 3 January'],
  ])('names %s as %s, the same in every time zone and runtime', (dayKey, expected) => {
    expect(dateName(dayKey)).toBe(expected);
  });

  it('refuses a malformed day key with InvalidDayKeyError', () => {
    expect(() => dateName('2026-02-30')).toThrow(InvalidDayKeyError);
  });
});
