import type { Database, SqlExecutor, SqlReader } from '@/modules/database';
import { readNumber } from '@/modules/database';

import { computeCarryOverKcal, dayTotalKcal } from '../services/carry-over.service';
import { assertDayKey, previousDayKey, shiftDayKey } from '../services/day-key.service';
import { assertValidKcal, DEFAULT_DAILY_CAP_KCAL, RemovalExceedsEatenError } from '../services/kcal.service';
import type { CarryOverDecision, DailyCapChange, DayCapChange, DaySummary, NewEntry } from '../types/tracking.types';
import { ENTRIES_TOTAL_KCAL_SQL, findStoredDay, unrecordedDay } from './stored-day.repository';

// Owner answer (foundation request [4]): a day's net entries never go below 0. The condition is part of the
// INSERT, so no other write can land between the check and the row; zero rows inserted is the refusal.
const INSERT_REMOVAL = `
  INSERT INTO entries (day_key, kind, kcal)
  SELECT ?, 'remove', ?
  WHERE (SELECT ${ENTRIES_TOTAL_KCAL_SQL} FROM entries WHERE entries.day_key = ?) >= ?`;

async function findDailyCap(reader: SqlReader): Promise<number | null> {
  const row = await reader.getFirstAsync('SELECT daily_cap_kcal AS capKcal FROM settings WHERE id = 1', []);

  return row === null ? null : readNumber(row, 'capKcal');
}

async function recordDayIfNew(txn: SqlExecutor, dayKey: string): Promise<void> {
  const previousKey = previousDayKey(dayKey);
  const existing = await txn.getFirstAsync('SELECT 1 FROM days WHERE day_key = ?', [dayKey]);

  if (existing !== null) {
    return;
  }

  const [previousDay, capKcal] = await Promise.all([findStoredDay(txn, previousKey), findDailyCap(txn)]);

  await txn.runAsync('INSERT INTO days (day_key, cap_kcal, carry_over_kcal) VALUES (?, ?, ?)', [
    dayKey,
    capKcal,
    computeCarryOverKcal(previousDay),
  ]);
}

// Owner's rule (foundation [2]): a day's carry-over is the previous day's total above its cap. An edit changes one
// day's total, so the days after it are recomputed in order. The walk stops at the first day not recorded, which
// carries nothing on whatever came before it, or at the first carry-over left unchanged: every day after it is unchanged.
async function recomputeCarryOversAfter(txn: SqlExecutor, editedDayKey: string): Promise<void> {
  for (let dayKey = shiftDayKey(editedDayKey, 1); ; dayKey = shiftDayKey(dayKey, 1)) {
    const [day, previousDay] = await Promise.all([findStoredDay(txn, dayKey), findStoredDay(txn, previousDayKey(dayKey))]);
    const carryOverKcal = computeCarryOverKcal(previousDay);

    if (day === null || day.carryOverKcal === carryOverKcal) {
      return;
    }

    await txn.runAsync('UPDATE days SET carry_over_kcal = ? WHERE day_key = ?', [carryOverKcal, dayKey]);
  }
}

export function getDaySummary(database: Database, dayKey: string): Promise<DaySummary> {
  return database.read(async (reader) => {
    const [storedDay, currentCapKcal] = await Promise.all([findStoredDay(reader, dayKey), findDailyCap(reader)]);
    const day = storedDay ?? unrecordedDay(await findStoredDay(reader, previousDayKey(dayKey)));

    return {
      dayKey,
      isRecorded: storedDay !== null,
      capKcal: day.capKcal,
      entriesTotalKcal: day.entriesTotalKcal,
      carryOverKcal: day.carryOverKcal,
      carryOverAdded: day.carryOverAdded,
      currentCapKcal,
      totalKcal: dayTotalKcal(day),
    };
  });
}

export async function addEntry(database: Database, entry: NewEntry): Promise<void> {
  assertValidKcal(entry.kcal);

  await database.write(async (txn) => {
    await recordDayIfNew(txn, entry.dayKey);

    if (entry.kind === 'add') {
      await txn.runAsync("INSERT INTO entries (day_key, kind, kcal) VALUES (?, 'add', ?)", [entry.dayKey, entry.kcal]);
    } else {
      const removal = await txn.runAsync(INSERT_REMOVAL, [entry.dayKey, entry.kcal, entry.dayKey, entry.kcal]);

      // Thrown inside the transaction, so the day row recordDayIfNew may have written rolls back with it.
      if (readNumber(removal, 'changes') === 0) {
        throw new RemovalExceedsEatenError();
      }
    }

    await recomputeCarryOversAfter(txn, entry.dayKey);
  });
}

export async function setDailyCap(database: Database, change: DailyCapChange): Promise<void> {
  assertValidKcal(change.capKcal);
  assertDayKey(change.todayKey);

  await database.write(async (txn) => {
    await txn.runAsync(
      'INSERT INTO settings (id, daily_cap_kcal) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET daily_cap_kcal = excluded.daily_cap_kcal',
      [change.capKcal],
    );
    await txn.runAsync('UPDATE days SET cap_kcal = ? WHERE day_key = ?', [change.capKcal, change.todayKey]);
    await recomputeCarryOversAfter(txn, change.todayKey);
  });
}

/** One day's own cap, recorded on it; the daily cap later days snapshot is left alone. */
export async function setDayCap(database: Database, change: DayCapChange): Promise<void> {
  assertValidKcal(change.capKcal);
  assertDayKey(change.dayKey);

  await database.write(async (txn) => {
    await recordDayIfNew(txn, change.dayKey);
    await txn.runAsync('UPDATE days SET cap_kcal = ? WHERE day_key = ?', [change.capKcal, change.dayKey]);
    await recomputeCarryOversAfter(txn, change.dayKey);
  });
}

export async function setCarryOverDecision(database: Database, decision: CarryOverDecision): Promise<void> {
  await database.write(async (txn) => {
    await recordDayIfNew(txn, decision.dayKey);
    await txn.runAsync('UPDATE days SET carry_over_added = ? WHERE day_key = ?', [
      decision.added ? 1 : 0,
      decision.dayKey,
    ]);
    await recomputeCarryOversAfter(txn, decision.dayKey);
  });
}

export async function ensureDailyCap(database: Database): Promise<void> {
  const capKcal = await database.read(findDailyCap);

  if (capKcal !== null) {
    return;
  }

  await database.write(async (txn) => {
    await txn.runAsync('INSERT INTO settings (id, daily_cap_kcal) VALUES (1, ?) ON CONFLICT (id) DO NOTHING', [
      DEFAULT_DAILY_CAP_KCAL,
    ]);
  });
}

export async function resetTrackingData(database: Database): Promise<void> {
  await database.write(async (txn) => {
    // Entries first: they reference days, and the app runs with foreign keys on.
    await txn.runAsync('DELETE FROM entries', []);
    await txn.runAsync('DELETE FROM days', []);
    await txn.runAsync('DELETE FROM settings', []);
  });
}
