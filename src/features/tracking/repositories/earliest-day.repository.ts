import type { Database } from '@/modules/database';

import { assertDayKey } from '../services/day-key.service';

const SELECT_EARLIEST_DAY = 'SELECT MIN(day_key) AS earliestDayKey FROM days';

function readNullableDayKey(row: unknown): string | null {
  const value = typeof row === 'object' && row !== null ? Reflect.get(row, 'earliestDayKey') : undefined;

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('Column earliestDayKey is neither text nor null');
  }

  assertDayKey(value);

  return value;
}

/** The oldest recorded day (an entry or a carry-over decision wrote it), or null before the first write. */
export function findEarliestDayKey(database: Database): Promise<string | null> {
  return database.read(async (reader) => readNullableDayKey(await reader.getFirstAsync(SELECT_EARLIEST_DAY, [])));
}
