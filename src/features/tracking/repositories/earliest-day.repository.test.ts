import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { findEarliestDayKey } from './earliest-day.repository';
import { addEntry, setCarryOverDecision } from './tracking.repository';

describe('findEarliestDayKey', () => {
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

  it('finds no day in a database nobody has written to', async () => {
    const earliest = await findEarliestDayKey(database);

    expect(earliest).toBeNull();
  });

  it('finds the oldest recorded day, whatever order the days were written in', async () => {
    await addEntry(database, { dayKey: '2026-10-02', kind: 'add', kcal: 500 });
    await addEntry(database, { dayKey: '2026-08-15', kind: 'add', kcal: 500 });
    await addEntry(database, { dayKey: '2026-09-30', kind: 'add', kcal: 500 });

    const earliest = await findEarliestDayKey(database);

    expect(earliest).toBe('2026-08-15');
  });

  it('counts a day recorded by a carry-over decision alone', async () => {
    await addEntry(database, { dayKey: '2026-10-02', kind: 'add', kcal: 500 });
    await setCarryOverDecision(database, { dayKey: '2026-07-01', added: false });

    const earliest = await findEarliestDayKey(database);

    expect(earliest).toBe('2026-07-01');
  });
});
