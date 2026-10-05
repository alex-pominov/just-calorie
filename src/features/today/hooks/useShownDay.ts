import { useState } from 'react';

import { earliestLoggableDayKey, shiftDayKey, useTodayKey } from '@/features/tracking';

import type { ShownDay } from '../types/today.types';

export interface DaySelection {
  shown: ShownDay;
  /** Shows that day, held between a year back and today; today then follows today across midnight. */
  select: (dayKey: string) => void;
  showPrevious: () => void;
  showNext: () => void;
}

function clampToLoggable(dayKey: string, todayKey: string): string {
  const earliest = earliestLoggableDayKey(todayKey);

  return dayKey < earliest ? earliest : dayKey;
}

/** The day the main screen shows: today until another is picked, never after today and never before a year back. */
export function useShownDay(): DaySelection {
  const todayKey = useTodayKey();
  const [pickedDayKey, setPickedDayKey] = useState<string | null>(null);
  const dayKey = pickedDayKey !== null && pickedDayKey < todayKey ? clampToLoggable(pickedDayKey, todayKey) : todayKey;
  const select = (next: string) => setPickedDayKey(next < todayKey ? clampToLoggable(next, todayKey) : null);

  return {
    shown: { dayKey, todayKey },
    select,
    showPrevious: () => select(shiftDayKey(dayKey, -1)),
    showNext: () => select(shiftDayKey(dayKey, 1)),
  };
}
