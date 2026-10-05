import type { Database } from '@/modules/database';

import { dayTotalKcal } from '../services/carry-over.service';
import { assertDayKey, previousDayKey } from '../services/day-key.service';
import type { DayLog, DayRange } from '../types/day-log.types';
import { findStoredDay, unrecordedDay } from './stored-day.repository';

function dayKeysOf({ firstDayKey, lastDayKey }: DayRange): string[] {
  assertDayKey(firstDayKey);
  assertDayKey(lastDayKey);

  if (firstDayKey > lastDayKey) {
    throw new RangeError('A day range must not end before it starts');
  }

  const newestFirst: string[] = [];

  for (let dayKey = lastDayKey; dayKey >= firstDayKey; dayKey = previousDayKey(dayKey)) {
    newestFirst.push(dayKey);
  }

  return newestFirst.reverse();
}

export async function getDaySummaries(database: Database, range: DayRange): Promise<DayLog[]> {
  const dayKeys = dayKeysOf(range);

  return database.read(async (reader) => {
    const [dayBefore, ...storedDays] = await Promise.all(
      [previousDayKey(range.firstDayKey), ...dayKeys].map((dayKey) => findStoredDay(reader, dayKey)),
    );
    const previousDays = [dayBefore ?? null, ...storedDays];

    return dayKeys.map((dayKey, index) => {
      const day = storedDays[index] ?? unrecordedDay(previousDays[index] ?? null);

      return { dayKey, ...day, totalKcal: dayTotalKcal(day) };
    });
  });
}
