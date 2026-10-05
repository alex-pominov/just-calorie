import type { DayStatus } from '@/features/tracking';

/** A day cell's look: how a past day went, or where today and tomorrow sit. */
export type WeekStripVariant = DayStatus | 'today' | 'tomorrow';

export interface WeekStripDay {
  dayKey: string;
  variant: WeekStripVariant;
  /** The day the main screen shows. */
  selected: boolean;
  weekday: string;
  day: string;
  accessibilityLabel: string;
}
