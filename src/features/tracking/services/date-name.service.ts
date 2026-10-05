import { assertDayKey } from './day-key.service';

// English, as all of the app's copy is; there is no copy catalogue yet. Written out rather than Intl, so jest's
// ICU and the device's formatter cannot disagree about a label a test asserts.
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** A day as copy and screen readers name it: 'Friday 2 October'. */
export function dateName(dayKey: string): string {
  assertDayKey(dayKey);

  const [year = 0, month = 1, day = 1] = dayKey.split('-').map(Number);
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  return `${weekday ?? ''} ${day} ${MONTH_NAMES[month - 1] ?? ''}`;
}
