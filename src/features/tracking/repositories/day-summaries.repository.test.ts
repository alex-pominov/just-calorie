import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { InvalidDayKeyError } from '../services/day-key.service';
import { dayStatus } from '../services/day-status.service';
import type { EntryKind } from '../types/tracking.types';
import { getDaySummaries } from './day-summaries.repository';
import { addEntry, getDaySummary, setCarryOverDecision, setDailyCap } from './tracking.repository';

const DAY_1 = '2026-09-30';
const DAY_2 = '2026-10-01';
const DAY_3 = '2026-10-02';
const DAY_4 = '2026-10-03';
const DAY_5 = '2026-10-04';

describe('day summaries repository', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const log = (dayKey: string, kind: EntryKind, kcal: number) => addEntry(database, { dayKey, kind, kcal });

  beforeEach(async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
    await setDailyCap(database, { capKcal: 1200, todayKey: DAY_1 });
  });

  afterEach(async () => {
    await connection.closeAsync();
    file.remove();
  });

  it('returns one summary per day of the inclusive range, oldest first, unrecorded days included', async () => {
    await log(DAY_2, 'add', 800);
    await log(DAY_4, 'add', 300);

    const days = await getDaySummaries(database, { firstDayKey: DAY_1, lastDayKey: DAY_5 });

    expect(days.map((day) => [day.dayKey, day.entryCount, day.entriesTotalKcal])).toEqual([
      [DAY_1, 0, 0],
      [DAY_2, 1, 800],
      [DAY_3, 0, 0],
      [DAY_4, 1, 300],
      [DAY_5, 0, 0],
    ]);
  });

  it('returns a day nobody has written to as an explicit empty summary', async () => {
    const days = await getDaySummaries(database, { firstDayKey: DAY_3, lastDayKey: DAY_3 });

    expect(days).toEqual([
      {
        dayKey: DAY_3,
        entryCount: 0,
        entriesTotalKcal: 0,
        capKcal: null,
        carryOverKcal: 0,
        carryOverAdded: null,
        totalKcal: 0,
      },
    ]);
  });

  it('counts entry rows apart from their net total', async () => {
    await log(DAY_2, 'add', 200);
    await log(DAY_2, 'remove', 200);

    const [day] = await getDaySummaries(database, { firstDayKey: DAY_2, lastDayKey: DAY_2 });

    expect(day).toMatchObject({ entryCount: 2, entriesTotalKcal: 0, totalKcal: 0, capKcal: 1200 });
  });

  it('chains an added carry-over across the range and adds it into each day’s total', async () => {
    await log(DAY_1, 'add', 1600);
    await setCarryOverDecision(database, { dayKey: DAY_2, added: true });
    await log(DAY_2, 'add', 1000);
    await log(DAY_3, 'add', 100);

    const days = await getDaySummaries(database, { firstDayKey: DAY_1, lastDayKey: DAY_3 });

    expect(days.map((day) => [day.carryOverKcal, day.carryOverAdded, day.totalKcal])).toEqual([
      [0, null, 1600],
      [400, true, 1400],
      [200, null, 100],
    ]);
  });

  it('shows an unrecorded day the carry-over it would be recorded with, the range’s first day included', async () => {
    await log(DAY_1, 'add', 1500);
    await log(DAY_3, 'add', 1300);

    const days = await getDaySummaries(database, { firstDayKey: DAY_2, lastDayKey: DAY_4 });

    expect(days.map((day) => [day.dayKey, day.carryOverKcal])).toEqual([
      [DAY_2, 300],
      [DAY_3, 0],
      [DAY_4, 100],
    ]);
  });

  it('agrees with the single-day summary on every day of the range', async () => {
    await log(DAY_1, 'add', 1600);
    await setCarryOverDecision(database, { dayKey: DAY_2, added: false });
    await log(DAY_3, 'add', 900);
    await log(DAY_3, 'remove', 100);
    await setCarryOverDecision(database, { dayKey: DAY_4, added: true });

    const days = await getDaySummaries(database, { firstDayKey: DAY_1, lastDayKey: DAY_5 });
    const singles = await Promise.all([DAY_1, DAY_2, DAY_3, DAY_4, DAY_5].map((key) => getDaySummary(database, key)));

    expect(days).toEqual(
      singles.map(({ dayKey, capKcal, entriesTotalKcal, carryOverKcal, carryOverAdded, totalKcal }) =>
        expect.objectContaining({ dayKey, capKcal, entriesTotalKcal, carryOverKcal, carryOverAdded, totalKcal }),
      ),
    );
  });

  it('feeds the day-status rule: a carry-over decision alone leaves a day unfilled', async () => {
    await log(DAY_1, 'add', 1600);
    await setCarryOverDecision(database, { dayKey: DAY_2, added: true });
    await log(DAY_3, 'add', 1300);

    const days = await getDaySummaries(database, { firstDayKey: DAY_1, lastDayKey: DAY_4 });

    expect(days.map(dayStatus)).toEqual(['overaten', 'unfilled', 'overaten', 'unfilled']);
  });

  it('reads every day of the range in one database read', async () => {
    const read = jest.spyOn(database, 'read');
    await log(DAY_2, 'add', 500);

    const days = await getDaySummaries(database, { firstDayKey: '2026-09-21', lastDayKey: DAY_5 });

    expect(days).toHaveLength(14);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('runs day keys across a month end and the autumn clock change', async () => {
    const days = await getDaySummaries(database, { firstDayKey: '2026-10-30', lastDayKey: '2026-11-02' });

    expect(days.map((day) => day.dayKey)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('refuses a malformed day key with InvalidDayKeyError', async () => {
    const attempts = [
      getDaySummaries(database, { firstDayKey: '2026-02-30', lastDayKey: DAY_5 }),
      getDaySummaries(database, { firstDayKey: DAY_1, lastDayKey: '04/10/2026' }),
    ];

    const results = await Promise.allSettled(attempts);

    expect(results.map((result) => result.status === 'rejected' && result.reason instanceof InvalidDayKeyError)).toEqual([
      true,
      true,
    ]);
  });

  it('refuses a range that ends before it starts', async () => {
    const attempt = getDaySummaries(database, { firstDayKey: DAY_3, lastDayKey: DAY_2 });

    await expect(attempt).rejects.toThrow(RangeError);
  });
});
