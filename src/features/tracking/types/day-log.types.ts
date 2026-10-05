/** One day of a multi-day read. A day not yet written to has no entries, cap or decision, and a live carry-over. */
export interface DayLog {
  dayKey: string;
  /** Entry rows stored for the day. A carry-over decision alone records the day but adds no entry. */
  entryCount: number;
  /** Additions minus removals; may be negative. */
  entriesTotalKcal: number;
  /** The cap snapshot the day is judged against; null while unrecorded, or when no cap was set at the time. */
  capKcal: number | null;
  /** Stored once the day is recorded; until then computed live from the previous day, as `useDaySummary` does. */
  carryOverKcal: number;
  carryOverAdded: boolean | null;
  /** Entries plus the carry-over when it was added. */
  totalKcal: number;
}

/** A day as the database holds it, before a summary derives its total. */
export type StoredDay = Omit<DayLog, 'dayKey' | 'totalKcal'>;

/** An inclusive run of day keys, oldest first. */
export interface DayRange {
  firstDayKey: string;
  lastDayKey: string;
}

/** How a past day went. Today and later days are placed by the caller, never by this rule. */
export type DayStatus = 'unfilled' | 'overaten' | 'on-track';
