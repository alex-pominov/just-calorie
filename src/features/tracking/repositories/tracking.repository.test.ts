import type { Database } from '@/modules/database';
import { readNumber } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { SCHEMA_VERSION } from '@/modules/database/migrations';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { InvalidDayKeyError } from '../services/day-key.service';
import { DEFAULT_DAILY_CAP_KCAL, InvalidKcalError, MAX_KCAL, RemovalExceedsEatenError } from '../services/kcal.service';
import type { EntryKind } from '../types/tracking.types';
import {
  addEntry,
  ensureDailyCap,
  getDaySummary,
  resetTrackingData,
  setCarryOverDecision,
  setDailyCap,
  setDayCap,
} from './tracking.repository';

const DAY_1 = '2026-10-02';
const DAY_2 = '2026-10-03';
const DAY_3 = '2026-10-04';

describe('tracking repository', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const open = async () => {
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
  };

  const log = (dayKey: string, kind: EntryKind, kcal: number) => addEntry(database, { dayKey, kind, kcal });
  const summaryOf = (dayKey: string) => getDaySummary(database, dayKey);

  beforeEach(async () => {
    file = createTemporaryDatabaseFile();
    await open();
  });

  afterEach(async () => {
    await connection.closeAsync();
    file.remove();
  });

  describe('entries', () => {
    it('sums added entries and subtracts removed ones into the day total', async () => {
      await log(DAY_1, 'add', 500);
      await log(DAY_1, 'add', 300);
      await log(DAY_1, 'remove', 200);

      const summary = await summaryOf(DAY_1);

      expect(summary).toMatchObject({ isRecorded: true, entriesTotalKcal: 600, totalKcal: 600 });
    });

    it('keeps each day’s entries apart', async () => {
      await log(DAY_1, 'add', 500);
      await log(DAY_2, 'add', 700);

      const summaries = await Promise.all([summaryOf(DAY_1), summaryOf(DAY_2)]);

      expect(summaries.map((summary) => summary.entriesTotalKcal)).toEqual([500, 700]);
    });

    it('reports a day nobody has written to as unrecorded and empty', async () => {
      const summary = await summaryOf(DAY_1);

      expect(summary).toEqual({
        dayKey: DAY_1,
        isRecorded: false,
        capKcal: null,
        currentCapKcal: null,
        entriesTotalKcal: 0,
        carryOverKcal: 0,
        carryOverAdded: null,
        totalKcal: 0,
      });
    });
  });

  describe('removals', () => {
    const entryRowCount = async () => {
      const row = await connection.getFirstAsync('SELECT COUNT(*) AS count FROM entries', []);

      return readNumber(row, 'count');
    };

    it('lets a removal take the day’s eaten exactly to 0', async () => {
      await log(DAY_1, 'add', 200);

      await log(DAY_1, 'remove', 200);

      expect(await summaryOf(DAY_1)).toMatchObject({ entriesTotalKcal: 0, totalKcal: 0 });
    });

    it('refuses a removal one kcal past the day’s eaten and stores nothing', async () => {
      await log(DAY_1, 'add', 200);

      const attempt = log(DAY_1, 'remove', 201);

      await expect(attempt).rejects.toThrow(RemovalExceedsEatenError);
      expect(await summaryOf(DAY_1)).toMatchObject({ entriesTotalKcal: 200 });
      expect(await entryRowCount()).toBe(1);
    });

    it('refuses a removal from a day with nothing eaten and leaves the day unrecorded', async () => {
      const attempt = log(DAY_1, 'remove', 1);

      await expect(attempt).rejects.toThrow(RemovalExceedsEatenError);
      expect(await summaryOf(DAY_1)).toMatchObject({ isRecorded: false, entriesTotalKcal: 0 });
    });

    it('lets exactly one of two concurrent removals through when together they would go below 0', async () => {
      await log(DAY_1, 'add', 200);

      const results = await Promise.allSettled([log(DAY_1, 'remove', 150), log(DAY_1, 'remove', 150)]);

      expect(results.map((result) => result.status).toSorted()).toEqual(['fulfilled', 'rejected']);
      expect(results.find((result) => result.status === 'rejected')?.reason).toBeInstanceOf(RemovalExceedsEatenError);
      expect(await summaryOf(DAY_1)).toMatchObject({ entriesTotalKcal: 50 });
    });

    it('measures a removal against the day’s entries alone, never its added carry-over', async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });
      await log(DAY_1, 'add', 2400);
      await setCarryOverDecision(database, { dayKey: DAY_2, added: true });
      await log(DAY_2, 'add', 100);

      const attempt = log(DAY_2, 'remove', 101);

      await expect(attempt).rejects.toThrow(RemovalExceedsEatenError);
      expect(await summaryOf(DAY_2)).toMatchObject({ entriesTotalKcal: 100, carryOverKcal: 400, totalKcal: 500 });
    });
  });

  describe('daily cap', () => {
    it('leaves the cap unset until the user sets one', async () => {
      await log(DAY_1, 'add', 500);

      const summary = await summaryOf(DAY_1);

      expect(summary).toMatchObject({ capKcal: null, currentCapKcal: null });
    });

    it('stores the cap the user sets as the current cap', async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });

      const summary = await summaryOf(DAY_1);

      expect(summary.currentCapKcal).toBe(2000);
    });

    it('snapshots the current cap onto a day when it is first recorded', async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });

      await log(DAY_1, 'add', 500);

      expect(await summaryOf(DAY_1)).toMatchObject({ capKcal: 2000, currentCapKcal: 2000 });
    });

    it('updates the snapshot of the day passed in and leaves every other day’s alone', async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });
      await log(DAY_1, 'add', 500);
      await log(DAY_2, 'add', 500);

      await setDailyCap(database, { capKcal: 1800, todayKey: DAY_2 });

      const summaries = await Promise.all([summaryOf(DAY_1), summaryOf(DAY_2)]);
      expect(summaries.map((summary) => [summary.capKcal, summary.currentCapKcal])).toEqual([
        [2000, 1800],
        [1800, 1800],
      ]);
    });

    it('leaves an unrecorded day for its first write to snapshot', async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });

      await setDailyCap(database, { capKcal: 1800, todayKey: DAY_1 });
      const beforeWrite = await summaryOf(DAY_1);
      await log(DAY_1, 'add', 500);

      expect(beforeWrite).toMatchObject({ isRecorded: false, capKcal: null });
      expect(await summaryOf(DAY_1)).toMatchObject({ isRecorded: true, capKcal: 1800 });
    });
  });

  describe('default daily cap', () => {
    it('stores the default cap on a database that has none', async () => {
      await ensureDailyCap(database);

      expect((await summaryOf(DAY_1)).currentCapKcal).toBe(DEFAULT_DAILY_CAP_KCAL);
      expect(DEFAULT_DAILY_CAP_KCAL).toBe(1200);
    });

    it('writes nothing when a cap is already stored, whether the default or the user’s', async () => {
      await ensureDailyCap(database);
      await setDailyCap(database, { capKcal: 1800, todayKey: DAY_1 });
      const write = jest.spyOn(database, 'write');

      await ensureDailyCap(database);
      await ensureDailyCap(database);

      expect(write).not.toHaveBeenCalled();
      expect((await summaryOf(DAY_1)).currentCapKcal).toBe(1800);
    });

    it('lets the user replace the default cap', async () => {
      await ensureDailyCap(database);

      await setDailyCap(database, { capKcal: 1500, todayKey: DAY_1 });

      expect((await summaryOf(DAY_1)).currentCapKcal).toBe(1500);
    });

    it('snapshots the default cap onto the first day recorded after it', async () => {
      await ensureDailyCap(database);

      await log(DAY_1, 'add', 500);

      expect(await summaryOf(DAY_1)).toMatchObject({ capKcal: DEFAULT_DAILY_CAP_KCAL });
    });
  });

  describe('reset', () => {
    const countRows = async (table: string) =>
      Number(Reflect.get((await connection.getFirstAsync(`SELECT COUNT(*) AS n FROM ${table}`, [])) ?? {}, 'n'));

    it('deletes every entry, day and setting, and leaves the schema version alone', async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });
      await log(DAY_1, 'add', 2300);
      await setCarryOverDecision(database, { dayKey: DAY_2, added: true });
      const versionBefore = await connection.getFirstAsync('PRAGMA user_version', []);

      await resetTrackingData(database);

      expect(await Promise.all(['entries', 'days', 'settings'].map(countRows))).toEqual([0, 0, 0]);
      expect(await connection.getFirstAsync('PRAGMA user_version', [])).toEqual(versionBefore);
      expect(await summaryOf(DAY_1)).toMatchObject({ isRecorded: false, currentCapKcal: null, entriesTotalKcal: 0 });
    });

    it('tells subscribers, so every screen re-reads the emptied data', async () => {
      const listener = jest.fn();
      database.subscribe(listener);

      await resetTrackingData(database);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('carry-over', () => {
    beforeEach(async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });
    });

    it('carries nothing into a day when the previous day stayed under its cap', async () => {
      await log(DAY_1, 'add', 1500);

      await log(DAY_2, 'add', 100);

      expect((await summaryOf(DAY_2)).carryOverKcal).toBe(0);
    });

    it('carries the previous day’s overage into the next day', async () => {
      await log(DAY_1, 'add', 2300);

      await log(DAY_2, 'add', 100);

      expect(await summaryOf(DAY_2)).toMatchObject({ carryOverKcal: 300, carryOverAdded: null, totalKcal: 100 });
    });

    it('chains an added carry-over into the following day’s overage across three days', async () => {
      await log(DAY_1, 'add', 2300);
      await setCarryOverDecision(database, { dayKey: DAY_2, added: true });
      await log(DAY_2, 'add', 1900);

      await log(DAY_3, 'add', 100);

      expect(await summaryOf(DAY_2)).toMatchObject({ carryOverKcal: 300, totalKcal: 2200 });
      expect((await summaryOf(DAY_3)).carryOverKcal).toBe(200);
    });

    it('does not chain a carry-over the user declined', async () => {
      await log(DAY_1, 'add', 2300);
      await setCarryOverDecision(database, { dayKey: DAY_2, added: false });
      await log(DAY_2, 'add', 1900);

      await log(DAY_3, 'add', 100);

      expect((await summaryOf(DAY_3)).carryOverKcal).toBe(0);
    });

    it('carries nothing into the first day ever recorded', async () => {
      await log(DAY_2, 'add', 2500);

      const summary = await summaryOf(DAY_2);

      expect(summary.carryOverKcal).toBe(0);
    });

    it('shows an unrecorded day the carry-over it would be recorded with', async () => {
      await log(DAY_1, 'add', 2300);

      const summary = await summaryOf(DAY_2);

      expect(summary).toMatchObject({ isRecorded: false, carryOverKcal: 300, carryOverAdded: null });
    });

    it('recomputes a recorded day’s carry-over when the previous day changes afterwards', async () => {
      await log(DAY_1, 'add', 2300);
      await log(DAY_2, 'add', 100);

      await log(DAY_1, 'add', 200);

      expect((await summaryOf(DAY_2)).carryOverKcal).toBe(500);
    });
  });

  // Owner's rule (foundation [2]): carryOver(D) = max(0, total(D-1) - cap(D-1)), and a past day can be edited, so an
  // edit to day D recomputes every later recorded day in order.
  describe('carry-over chain', () => {
    const DAYS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'] as const;
    const [MON, TUE, WED, THU, FRI] = DAYS;
    const carryOvers = async () => (await Promise.all(DAYS.map(summaryOf))).map((summary) => summary.carryOverKcal);
    const userVersion = async () => readNumber(await connection.getFirstAsync('PRAGMA user_version', []), 'user_version');

    // Mon 2500 over a 2000 cap; Tue to Fri add each previous day's overage, so 500 chains forward with each day's own.
    const seedChain = async () => {
      for (const [dayKey, kcal] of [
        [MON, 2500],
        [TUE, 1800],
        [WED, 1800],
        [THU, 1500],
      ] as const) {
        await log(dayKey, 'add', kcal);
      }
      for (const dayKey of [TUE, WED, THU, FRI]) {
        await setCarryOverDecision(database, { dayKey, added: true });
      }
    };

    beforeEach(async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: MON });
      await seedChain();
    });

    it('chains each added overage forward through every later day', async () => {
      expect(await carryOvers()).toEqual([0, 500, 300, 100, 0]);
    });

    it('recomputes every later day when an earlier day is edited', async () => {
      await log(MON, 'add', 400);

      expect(await carryOvers()).toEqual([0, 900, 700, 500, 0]);
      expect(await summaryOf(FRI)).toMatchObject({ carryOverKcal: 0, totalKcal: 0 });
    });

    it('recomputes the chain back when a day pushed over its cap is brought back under it', async () => {
      await log(THU, 'add', 900);
      const pushedOver = await carryOvers();

      await log(THU, 'remove', 900);

      expect(pushedOver).toEqual([0, 500, 300, 100, 500]);
      expect(await carryOvers()).toEqual([0, 500, 300, 100, 0]);
    });

    it('empties the chain when the first day falls under its cap', async () => {
      await log(MON, 'remove', 600);

      expect(await carryOvers()).toEqual([0, 0, 0, 0, 0]);
      expect(await summaryOf(THU)).toMatchObject({ carryOverAdded: true, totalKcal: 1500 });
    });

    it('keeps a day’s yes to its carry-over when an edit changes the amount, and adds the new amount', async () => {
      await log(WED, 'add', 2000);

      expect(await summaryOf(THU)).toMatchObject({ carryOverKcal: 2100, carryOverAdded: true, totalKcal: 3600 });
      expect(await summaryOf(FRI)).toMatchObject({ carryOverKcal: 1600, carryOverAdded: true });
    });

    it('leaves a day that had no carry-over undecided when an edit gives it one, adding nothing', async () => {
      await resetTrackingData(database);
      await setDailyCap(database, { capKcal: 2000, todayKey: MON });
      await log(MON, 'add', 1500);
      await log(TUE, 'add', 1000);

      await log(MON, 'add', 900);

      expect(await summaryOf(TUE)).toMatchObject({ carryOverKcal: 400, carryOverAdded: null, totalKcal: 1000 });
    });

    it('recomputes the later days when a carry-over decision changes on an earlier day', async () => {
      await setCarryOverDecision(database, { dayKey: TUE, added: false });

      expect(await carryOvers()).toEqual([0, 500, 0, 0, 0]);
    });

    it('recomputes the later days when an earlier day’s cap changes, and keeps the daily cap', async () => {
      await setDayCap(database, { dayKey: MON, capKcal: 2400 });

      expect(await carryOvers()).toEqual([0, 100, 0, 0, 0]);
      expect(await summaryOf(MON)).toMatchObject({ capKcal: 2400, currentCapKcal: 2000 });
    });

    it('carries a day backfilled before a recorded day into it', async () => {
      await resetTrackingData(database);
      await setDailyCap(database, { capKcal: 2000, todayKey: MON });
      await log(TUE, 'add', 1000);
      await setCarryOverDecision(database, { dayKey: TUE, added: true });

      await log(MON, 'add', 2300);

      expect(await summaryOf(TUE)).toMatchObject({ carryOverKcal: 300, totalKcal: 1300 });
    });

    it('stops the chain at a day nobody recorded, which carries nothing', async () => {
      await resetTrackingData(database);
      await setDailyCap(database, { capKcal: 2000, todayKey: MON });
      await log(WED, 'add', 1000);

      await log(MON, 'add', 2500);

      expect(await carryOvers()).toEqual([0, 500, 0, 0, 0]);
      expect(await summaryOf(TUE)).toMatchObject({ isRecorded: false });
    });

    it('leaves the chain untouched when a removal on a past day is refused', async () => {
      const before = await carryOvers();

      await expect(log(TUE, 'remove', 1801)).rejects.toThrow(RemovalExceedsEatenError);

      expect(await carryOvers()).toEqual(before);
      expect(await summaryOf(TUE)).toMatchObject({ entriesTotalKcal: 1800 });
    });

    it('keeps a recomputed chain across closing and reopening the database file', async () => {
      await log(MON, 'add', 400);

      await connection.closeAsync();
      await open();

      expect(await carryOvers()).toEqual([0, 900, 700, 500, 0]);
    });

    it('changes no schema: the database stays at user_version 1', async () => {
      await log(MON, 'add', 400);
      await setDayCap(database, { dayKey: WED, capKcal: 1500 });

      expect(SCHEMA_VERSION).toBe(1);
      expect(await userVersion()).toBe(1);
    });
  });

  describe('a past day’s cap', () => {
    it('records a day nobody wrote to with the cap set on it, and leaves the daily cap alone', async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_3 });

      await setDayCap(database, { dayKey: DAY_1, capKcal: 1500 });

      expect(await summaryOf(DAY_1)).toMatchObject({ isRecorded: true, capKcal: 1500, currentCapKcal: 2000 });
      expect(await summaryOf(DAY_3)).toMatchObject({ isRecorded: false, currentCapKcal: 2000 });
    });

    it.each([0, MAX_KCAL + 1])('refuses a cap of %p kcal on a past day and stores nothing', async (capKcal) => {
      await expect(setDayCap(database, { dayKey: DAY_1, capKcal })).rejects.toThrow(InvalidKcalError);
      expect(await summaryOf(DAY_1)).toMatchObject({ isRecorded: false });
    });
  });

  it('carries nothing out of a day that had no cap', async () => {
    await log(DAY_1, 'add', 3000);

    await setDailyCap(database, { capKcal: 2000, todayKey: DAY_2 });
    await log(DAY_2, 'add', 100);

    expect(await summaryOf(DAY_1)).toMatchObject({ capKcal: null });
    expect((await summaryOf(DAY_2)).carryOverKcal).toBe(0);
  });

  describe('carry-over decision', () => {
    beforeEach(async () => {
      await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });
      await log(DAY_1, 'add', 2300);
      await log(DAY_2, 'add', 1000);
    });

    it('persists an added decision and counts the carry-over in the day total', async () => {
      await setCarryOverDecision(database, { dayKey: DAY_2, added: true });

      const summary = await summaryOf(DAY_2);

      expect(summary).toMatchObject({ carryOverAdded: true, entriesTotalKcal: 1000, totalKcal: 1300 });
    });

    it('persists a declined decision and leaves the day total alone', async () => {
      await setCarryOverDecision(database, { dayKey: DAY_2, added: false });

      const summary = await summaryOf(DAY_2);

      expect(summary).toMatchObject({ carryOverAdded: false, totalKcal: 1000 });
    });

    it('records the day with its carry-over when the decision is its first write', async () => {
      await setCarryOverDecision(database, { dayKey: DAY_3, added: true });

      const summary = await summaryOf(DAY_3);

      expect(summary).toMatchObject({ isRecorded: true, carryOverKcal: 0, carryOverAdded: true });
    });
  });

  describe('validation', () => {
    it.each([0, -100, 12.5, Number.NaN, MAX_KCAL + 1])(
      'refuses an entry of %p kcal with InvalidKcalError and stores nothing',
      async (kcal) => {
        const attempt = log(DAY_1, 'add', kcal);

        await expect(attempt).rejects.toThrow(InvalidKcalError);
        expect(await summaryOf(DAY_1)).toMatchObject({ isRecorded: false, entriesTotalKcal: 0 });
      },
    );

    it.each([0, -100, 12.5, Number.NaN, MAX_KCAL + 1])(
      'refuses a cap of %p kcal with InvalidKcalError and stores nothing',
      async (capKcal) => {
        const attempt = setDailyCap(database, { capKcal, todayKey: DAY_1 });

        await expect(attempt).rejects.toThrow(InvalidKcalError);
        expect((await summaryOf(DAY_1)).currentCapKcal).toBeNull();
      },
    );

    it('accepts an entry of exactly MAX_KCAL', async () => {
      await log(DAY_1, 'add', MAX_KCAL);

      const summary = await summaryOf(DAY_1);

      expect(summary.entriesTotalKcal).toBe(MAX_KCAL);
    });

    it('refuses a malformed day key with InvalidDayKeyError', async () => {
      const attempts = [log('2026-02-30', 'add', 100), setDailyCap(database, { capKcal: 2000, todayKey: '04/10/2026' })];

      const results = await Promise.allSettled(attempts);

      expect(results.map((result) => result.status === 'rejected' && result.reason instanceof InvalidDayKeyError)).toEqual([
        true,
        true,
      ]);
    });
  });

  it('keeps every stored value across closing and reopening the database file', async () => {
    await setDailyCap(database, { capKcal: 2000, todayKey: DAY_1 });
    await log(DAY_1, 'add', 2300);
    await setCarryOverDecision(database, { dayKey: DAY_2, added: true });
    await log(DAY_2, 'add', 500);
    const beforeRestart = await Promise.all([summaryOf(DAY_1), summaryOf(DAY_2)]);

    await connection.closeAsync();
    await open();
    const afterRestart = await Promise.all([summaryOf(DAY_1), summaryOf(DAY_2)]);

    expect(afterRestart).toEqual(beforeRestart);
    expect(afterRestart[1]).toMatchObject({
      isRecorded: true,
      capKcal: 2000,
      currentCapKcal: 2000,
      carryOverKcal: 300,
      carryOverAdded: true,
      totalKcal: 800,
    });
  });
});
