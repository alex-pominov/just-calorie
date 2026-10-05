import type { SqlReader } from '@/modules/database';
import { readNullableNumber, readNumber } from '@/modules/database';

import { computeCarryOverKcal } from '../services/carry-over.service';
import type { StoredDay } from '../types/day-log.types';
import type { RecordedDay } from '../types/tracking.types';

/** A day's net entries: additions minus removals over the `entries` rows in scope, 0 with none. */
export const ENTRIES_TOTAL_KCAL_SQL = "COALESCE(SUM(CASE entries.kind WHEN 'add' THEN entries.kcal ELSE -entries.kcal END), 0)";

// The one statement that reads a day. getDaySummary and getDaySummaries both go through it, so a day's
// net total has one definition and the main screen and the calendar cannot show different numbers.
const SELECT_STORED_DAY = `
  SELECT
    days.cap_kcal AS capKcal,
    days.carry_over_kcal AS carryOverKcal,
    days.carry_over_added AS carryOverAdded,
    COUNT(entries.id) AS entryCount,
    ${ENTRIES_TOTAL_KCAL_SQL} AS entriesTotalKcal
  FROM days
  LEFT JOIN entries ON entries.day_key = days.day_key
  WHERE days.day_key = ?
  GROUP BY days.day_key`;

export async function findStoredDay(reader: SqlReader, dayKey: string): Promise<StoredDay | null> {
  const row = await reader.getFirstAsync(SELECT_STORED_DAY, [dayKey]);

  if (row === null) {
    return null;
  }

  const carryOverAdded = readNullableNumber(row, 'carryOverAdded');

  return {
    entryCount: readNumber(row, 'entryCount'),
    entriesTotalKcal: readNumber(row, 'entriesTotalKcal'),
    capKcal: readNullableNumber(row, 'capKcal'),
    carryOverKcal: readNumber(row, 'carryOverKcal'),
    carryOverAdded: carryOverAdded === null ? null : carryOverAdded === 1,
  };
}

/** A day not yet written to: nothing stored, and its carry-over follows the previous day live. */
export function unrecordedDay(previousDay: RecordedDay | null): StoredDay {
  return {
    entryCount: 0,
    entriesTotalKcal: 0,
    capKcal: null,
    carryOverKcal: computeCarryOverKcal(previousDay),
    carryOverAdded: null,
  };
}
