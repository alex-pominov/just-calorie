import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { getDaySummaries } from '../repositories/day-summaries.repository';
import { addEntry, getDaySummary, setDailyCap } from '../repositories/tracking.repository';
import { dayFigures } from './day-figures.service';
import { dayStatus } from './day-status.service';
import type { SeedScenario } from './seed-scenario.service';
import { isSeedScenario, SEED_SCENARIOS, seedScenario } from './seed-scenario.service';

const TODAY = '2026-10-03';

describe('seed scenarios', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  beforeEach(async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
  });

  afterEach(async () => {
    await connection.closeAsync();
    file.remove();
  });

  const ON_TRACK_HISTORY = ['on-track', 'on-track', 'on-track', 'unfilled'];

  it.each<[SeedScenario, string, object, string]>([
    ['empty', '1:2', { eatenKcal: 0, leftKcal: 1200, isOverCap: false }, 'on-track'],
    ['filled', '5:1744', { eatenKcal: 800, leftKcal: 400, isOverCap: false }, 'on-track'],
    ['over', '5:1869', { eatenKcal: 1600, leftKcal: 0, isOverCap: true }, 'on-track'],
    ['carry-added', '5:2069', { eatenKcal: 0, leftKcal: 800, isOverCap: false }, 'overaten'],
    ['carry-withheld', '5:2154', { eatenKcal: 0, leftKcal: 1200, isOverCap: false }, 'overaten'],
    ['carry-added-over', '9:4038', { eatenKcal: 1200, leftKcal: 0, isOverCap: true }, 'overaten'],
  ])('seeds %s with the figures and week of frame %s', async (scenario, _frame, figures, yesterday) => {
    await seedScenario(database, { scenario, todayKey: TODAY });

    const today = await getDaySummary(database, TODAY);
    const week = await getDaySummaries(database, { firstDayKey: '2026-09-28', lastDayKey: '2026-10-02' });

    expect(dayFigures(today)).toEqual({ ...figures, capKcal: 1200 });
    expect(week.map(dayStatus)).toEqual([...ON_TRACK_HISTORY, yesterday]);
  });

  it.each<[SeedScenario, object]>([
    ['empty', { isRecorded: false, carryOverKcal: 0, carryOverAdded: null }],
    ['carry-added', { isRecorded: true, carryOverKcal: 400, carryOverAdded: true, entriesTotalKcal: 0 }],
    ['carry-withheld', { isRecorded: true, carryOverKcal: 400, carryOverAdded: false, entriesTotalKcal: 0 }],
    ['carry-added-over', { isRecorded: true, carryOverKcal: 400, carryOverAdded: true, entriesTotalKcal: 1200 }],
  ])('stores today’s carry-over and decision for %s', async (scenario, expected) => {
    await seedScenario(database, { scenario, todayKey: TODAY });

    expect(await getDaySummary(database, TODAY)).toMatchObject({ ...expected, currentCapKcal: 1200 });
  });

  it('seeds over-chain as four over-cap days, each adding the overage carried into it', async () => {
    await seedScenario(database, { scenario: 'over-chain', todayKey: TODAY });

    const days = await getDaySummaries(database, { firstDayKey: '2026-09-28', lastDayKey: TODAY });

    expect(days.map((day) => [day.carryOverKcal, day.totalKcal])).toEqual([
      [0, 0],
      [0, 1600],
      [400, 1700],
      [500, 1500],
      [300, 1300],
      [100, 100],
    ]);
    expect(days.slice(1, 5).map(dayStatus)).toEqual(['overaten', 'overaten', 'overaten', 'overaten']);
  });

  it('replaces whatever was stored before it, the cap included', async () => {
    await setDailyCap(database, { capKcal: 2500, todayKey: TODAY });
    await addEntry(database, { dayKey: TODAY, kind: 'add', kcal: 3000 });
    await addEntry(database, { dayKey: '2026-09-20', kind: 'add', kcal: 700 });

    await seedScenario(database, { scenario: 'empty', todayKey: TODAY });

    const [old] = await getDaySummaries(database, { firstDayKey: '2026-09-20', lastDayKey: '2026-09-20' });
    expect(await getDaySummary(database, TODAY)).toMatchObject({ isRecorded: false, currentCapKcal: 1200 });
    expect(old).toMatchObject({ entryCount: 0 });
  });

  it('recognises exactly the scenario names, so a deep-link parameter can be checked', () => {
    const names = [...SEED_SCENARIOS, 'Empty', 'carry', '', 'over '];

    expect(names.filter(isSeedScenario)).toEqual([
      'empty',
      'filled',
      'over',
      'carry-added',
      'carry-withheld',
      'carry-added-over',
      'over-chain',
    ]);
  });
});
