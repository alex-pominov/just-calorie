import type { DayFigures } from '@/features/tracking';

import type { BowlState } from './bowl.types';
import type { WeekStripDay } from './week-strip.types';

/** The day the main screen shows, never after today. */
export interface ShownDay {
  dayKey: string;
  todayKey: string;
}

/** The previous day's overage, offered to the shown day; absent when there is none. */
export interface CarryOverOffer {
  kcal: number;
  added: boolean;
}

/** The shown day's numbers, ready to show once a cap is known. */
export interface TodayView {
  dayKey: string;
  isToday: boolean;
  figures: DayFigures;
  bowl: BowlState;
  bowlLabel: string;
  carryOver: CarryOverOffer | null;
}

export interface Today {
  /** The day on screen, which every action writes to. */
  dayKey: string;
  monthName: string;
  weekDays: readonly WeekStripDay[] | null;
  view: TodayView | null;
  /** Stores an addition; a failure is reported to the person, never left unhandled. */
  addKcal: (kcal: number) => void;
  toggleCarryOver: () => void;
  selectDay: (dayKey: string) => void;
  showPreviousDay: () => void;
  showNextDay: () => void;
}
