export type EntryKind = 'add' | 'remove';

export interface NewEntry {
  dayKey: string;
  kind: EntryKind;
  kcal: number;
}

export interface DailyCapChange {
  capKcal: number;
  todayKey: string;
}

export interface DayCapChange {
  capKcal: number;
  dayKey: string;
}

export interface CarryOverDecision {
  dayKey: string;
  added: boolean;
}

export interface RecordedDay {
  /** The cap this day is judged against, snapshotted when it was recorded; never judge it by today's cap. */
  capKcal: number | null;
  entriesTotalKcal: number;
  carryOverKcal: number;
  carryOverAdded: boolean | null;
}

export interface DaySummary extends RecordedDay {
  dayKey: string;
  /** False until the day's first write; until then its carry-over follows the previous day live. */
  isRecorded: boolean;
  currentCapKcal: number | null;
  totalKcal: number;
}

export interface DayFigures {
  /** The day's own entries, never below 0; an added carry-over is not counted as eaten. */
  eatenKcal: number;
  /** What remains under the cap, between 0 and the cap. */
  leftKcal: number;
  capKcal: number;
  isOverCap: boolean;
}
