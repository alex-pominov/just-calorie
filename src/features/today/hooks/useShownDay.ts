import { useRef, useState } from 'react';

import { earliestLoggableDayKey, shiftDayKey, useTodayKey } from '@/features/tracking';
import { playSelectionHaptic } from '@/modules/haptics';

import type { ShownDay } from '../types/today.types';

export interface DaySelection {
  shown: ShownDay;
  /** Shows that day, held between a year back and today; today then follows today across midnight. */
  select: (dayKey: string) => void;
  /** The swipe's steps: each ticks a selection haptic when, and only when, the shown day changes. */
  showPrevious: () => void;
  showNext: () => void;
}

/** The day shown for a pick: today for none or a day after today, else the pick held to a year back. */
function shownDayKeyFor(pickedDayKey: string | null, todayKey: string): string {
  if (pickedDayKey === null || pickedDayKey >= todayKey) return todayKey;

  const earliest = earliestLoggableDayKey(todayKey);

  return pickedDayKey < earliest ? earliest : pickedDayKey;
}

/** The day the main screen shows: today until another is picked, never after today and never before a year back. */
export function useShownDay(): DaySelection {
  const todayKey = useTodayKey();
  const [pickedDayKey, setPickedDayKey] = useState<string | null>(null);
  // The latest pick, which a step reads: two swipes ending before a re-render must each move from the day the other
  // left, or the second is lost and the tick counts a change that never happened (qa f-714067).
  const latestPick = useRef<string | null>(null);
  const dayKey = shownDayKeyFor(pickedDayKey, todayKey);
  const select = (next: string) => {
    const pick = next < todayKey ? shownDayKeyFor(next, todayKey) : null;

    latestPick.current = pick;
    setPickedDayKey(pick);
  };
  const step = (days: number) => {
    const from = shownDayKeyFor(latestPick.current, todayKey);
    const next = shiftDayKey(from, days);

    if (shownDayKeyFor(next, todayKey) !== from) playSelectionHaptic();
    select(next);
  };

  return {
    shown: { dayKey, todayKey },
    select,
    showPrevious: () => step(-1),
    showNext: () => step(1),
  };
}
