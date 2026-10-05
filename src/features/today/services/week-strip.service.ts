import type { DayLog, DayRange } from '@/features/tracking';
import { dateName, dayStatus, earliestLoggableDayKey, shiftDayKey } from '@/features/tracking';

import type { ShownDay } from '../types/today.types';
import type { WeekStripDay, WeekStripVariant } from '../types/week-strip.types';

const DAYS_BEFORE_TODAY = 13;
// A day shown further back than the fortnight widens the strip, so the strip can be scrolled to it.
const DAYS_BEFORE_SHOWN = 7;

// English as in Figma; there is no copy catalogue in this app yet.
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const SPOKEN_VARIANT = {
  'on-track': 'on track',
  overaten: 'over the cap',
  unfilled: 'nothing logged',
  today: 'today',
  tomorrow: 'tomorrow',
} satisfies Record<WeekStripVariant, string>;

interface CalendarDate {
  weekday: (typeof WEEKDAYS)[number];
  month: (typeof MONTHS)[number];
  day: number;
}

// A day key is a validated calendar date, so its parts and the UTC weekday of that date are exact.
function calendarDateOf(dayKey: string): CalendarDate {
  const [year = 0, month = 1, day = 1] = dayKey.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? WEEKDAYS[0];

  return { weekday, month: MONTHS[month - 1] ?? MONTHS[0], day };
}

function variantOf(log: DayLog, todayKey: string): WeekStripVariant {
  if (log.dayKey === todayKey) return 'today';
  if (log.dayKey > todayKey) return 'tomorrow';

  return dayStatus(log);
}

export function weekStripRange({ dayKey, todayKey }: ShownDay): DayRange {
  const fortnightStart = shiftDayKey(todayKey, -DAYS_BEFORE_TODAY);
  const shownWeekStart = shiftDayKey(dayKey, -DAYS_BEFORE_SHOWN);
  const earliest = earliestLoggableDayKey(todayKey);
  const firstDayKey = shownWeekStart < fortnightStart ? shownWeekStart : fortnightStart;

  return { firstDayKey: firstDayKey < earliest ? earliest : firstDayKey, lastDayKey: shiftDayKey(todayKey, 1) };
}

export function weekStripDays(shown: ShownDay, days: readonly DayLog[]): WeekStripDay[] {
  return days.map((log) => {
    const { weekday, day } = calendarDateOf(log.dayKey);
    const variant = variantOf(log, shown.todayKey);

    return {
      dayKey: log.dayKey,
      variant,
      selected: log.dayKey === shown.dayKey,
      weekday,
      day: String(day),
      accessibilityLabel: `${dateName(log.dayKey)}, ${SPOKEN_VARIANT[variant]}`,
    };
  });
}

export function monthShortName(dayKey: string): string {
  return calendarDateOf(dayKey).month;
}
