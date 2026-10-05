const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;
// How far back a day can be shown and logged. A day older than this would make the calendar read every day since.
const LOGGABLE_DAYS_BACK = 365;

export class InvalidDayKeyError extends Error {
  constructor() {
    super('A day key must be a calendar date written YYYY-MM-DD');
    this.name = 'InvalidDayKeyError';
  }
}

const pad = (value: number, length: number) => String(value).padStart(length, '0');

export function toDayKey(instant: Date): string {
  return `${pad(instant.getFullYear(), 4)}-${pad(instant.getMonth() + 1, 2)}-${pad(instant.getDate(), 2)}`;
}

// Calendar arithmetic runs at UTC midnight, where every day is 24h long: done in local time,
// subtracting a day across a DST change lands on the same day or skips one.
function findUtcMidnight(dayKey: string): Date | null {
  if (!DAY_KEY_PATTERN.test(dayKey)) {
    return null;
  }

  const midnight = new Date(`${dayKey}T00:00:00.000Z`);

  return Number.isNaN(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== dayKey ? null : midnight;
}

function toUtcMidnight(dayKey: string): Date {
  const midnight = findUtcMidnight(dayKey);

  if (midnight === null) {
    throw new InvalidDayKeyError();
  }

  return midnight;
}

export function assertDayKey(dayKey: string): void {
  toUtcMidnight(dayKey);
}

/** The oldest day that can be shown and logged: a year before today. */
export function earliestLoggableDayKey(todayKey: string): string {
  return shiftDayKey(todayKey, -LOGGABLE_DAYS_BACK);
}

/** The day a link's `day` parameter writes to: that day when it is a valid key within the last year, otherwise today. */
export function loggableDayKey(param: unknown, todayKey: string): string {
  if (typeof param !== 'string' || findUtcMidnight(param) === null) {
    return todayKey;
  }

  return param > todayKey || param < earliestLoggableDayKey(todayKey) ? todayKey : param;
}

export function previousDayKey(dayKey: string): string {
  return new Date(toUtcMidnight(dayKey).getTime() - MS_PER_DAY).toISOString().slice(0, 10);
}

export function shiftDayKey(dayKey: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError('A day key moves by a whole number of days');
  }

  return new Date(toUtcMidnight(dayKey).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function millisecondsUntilNextDay(instant: Date): number {
  const nextMidnight = new Date(instant.getFullYear(), instant.getMonth(), instant.getDate() + 1);

  return nextMidnight.getTime() - instant.getTime();
}
