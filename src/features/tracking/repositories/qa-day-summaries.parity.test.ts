// QA reproduction (ms1r-qa-static): randomized parity of getDaySummaries against getDaySummary, and of
// dayStatus against an independent oracle of Manager ruling [1] computed from raw rows.
import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { previousDayKey } from '../services/day-key.service';
import { dayStatus } from '../services/day-status.service';
import { RemovalExceedsEatenError } from '../services/kcal.service';
import { getDaySummaries } from './day-summaries.repository';
import { addEntry, getDaySummary, setCarryOverDecision, setDailyCap } from './tracking.repository';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAST = '2027-01-03'; // spans a year end
const DAYS: string[] = (() => {
  const keys = [LAST];
  while (keys.length < 12) keys.unshift(previousDayKey(keys[0]!));
  return keys;
})();

async function oracleNet(connection: NodeSqliteDatabase, dayKey: string) {
  const net = (await connection.getFirstAsync(
    "SELECT COALESCE(SUM(CASE kind WHEN 'add' THEN kcal ELSE -kcal END), 0) AS net FROM entries WHERE day_key = ?",
    [dayKey],
  )) as { net: number };
  return net.net;
}

// Ruling [1], written from the ruling text, not from the implementation.
async function oracleStatus(connection: NodeSqliteDatabase, dayKey: string) {
  const count = (await connection.getFirstAsync('SELECT COUNT(*) AS n FROM entries WHERE day_key = ?', [dayKey])) as {
    n: number;
  };
  if (count.n === 0) return 'unfilled';
  const day = (await connection.getFirstAsync(
    'SELECT cap_kcal AS cap, carry_over_kcal AS carry, carry_over_added AS added FROM days WHERE day_key = ?',
    [dayKey],
  )) as { cap: number | null; carry: number; added: number | null };
  const total = (await oracleNet(connection, dayKey)) + (day.added === 1 ? day.carry : 0);
  if (day.cap === null) return 'on-track';
  return total > day.cap ? 'overaten' : 'on-track';
}

describe('QA: multi-day read parity and rule oracle, randomized', () => {
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

  it.each(Array.from({ length: 40 }, (_, seed) => seed + 1))('seed %i', async (seed) => {
    const random = mulberry32(seed);
    const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
    const capFirst = random() < 0.8;
    if (capFirst) await setDailyCap(database, { capKcal: pick([800, 1200, 2000]), todayKey: DAYS[0]! });

    const operations = 10 + Math.floor(random() * 30);
    for (let step = 0; step < operations; step += 1) {
      const dayKey = pick(DAYS);
      const roll = random();
      if (roll < 0.55) {
        await addEntry(database, { dayKey, kind: 'add', kcal: 1 + Math.floor(random() * 1500) });
      } else if (roll < 0.7) {
        // Owner answer to foundation [4]: refused exactly when the day's raw net is below the amount, storing nothing.
        const kcal = 1 + Math.floor(random() * 800);
        const netBefore = await oracleNet(connection, dayKey);
        const removal = addEntry(database, { dayKey, kind: 'remove', kcal });
        if (netBefore < kcal) {
          await expect(removal).rejects.toThrow(RemovalExceedsEatenError);
          expect(await oracleNet(connection, dayKey)).toBe(netBefore);
        } else {
          await removal;
        }
      } else if (roll < 0.9) {
        await setCarryOverDecision(database, { dayKey, added: random() < 0.6 });
      } else {
        await setDailyCap(database, { capKcal: pick([500, 1200, 3000]), todayKey: dayKey });
      }
    }

    const first = Math.floor(random() * DAYS.length);
    const last = first + Math.floor(random() * (DAYS.length - first));
    const ranges: [string, string][] = [
      [DAYS[0]!, LAST],
      [DAYS[first]!, DAYS[last]!],
    ];

    for (const [firstDayKey, lastDayKey] of ranges) {
      const days = await getDaySummaries(database, { firstDayKey, lastDayKey });
      for (const day of days) {
        const single = await getDaySummary(database, day.dayKey);
        expect({
          dayKey: day.dayKey,
          capKcal: day.capKcal,
          entriesTotalKcal: day.entriesTotalKcal,
          carryOverKcal: day.carryOverKcal,
          carryOverAdded: day.carryOverAdded,
          totalKcal: day.totalKcal,
        }).toEqual({
          dayKey: single.dayKey,
          capKcal: single.capKcal,
          entriesTotalKcal: single.entriesTotalKcal,
          carryOverKcal: single.carryOverKcal,
          carryOverAdded: single.carryOverAdded,
          totalKcal: single.totalKcal,
        });
        expect([day.dayKey, dayStatus(day)]).toEqual([day.dayKey, await oracleStatus(connection, day.dayKey)]);
      }
    }
  });
});
