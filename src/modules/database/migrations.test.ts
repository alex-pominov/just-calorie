import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { SCHEMA_VERSION } from './migrations';
import { prepareDatabase } from './prepare-database';

const TABLE_NAMES =
  "SELECT group_concat(name) AS names FROM (SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name)";

describe('prepareDatabase', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;

  beforeEach(() => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
  });

  afterEach(async () => {
    await connection.closeAsync();
    file.remove();
  });

  it('creates every table on an empty database and stamps the schema version', async () => {
    await prepareDatabase(connection);

    expect(await connection.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: SCHEMA_VERSION });
    expect(await connection.getFirstAsync(TABLE_NAMES, [])).toEqual({ names: 'days,entries,settings' });
  });

  it('changes neither schema nor data when re-run at the current version', async () => {
    await prepareDatabase(connection);
    await connection.runAsync('INSERT INTO settings (id, daily_cap_kcal) VALUES (1, ?)', [1800]);

    await prepareDatabase(connection);

    expect(await connection.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: SCHEMA_VERSION });
    expect(await connection.getFirstAsync('SELECT daily_cap_kcal FROM settings', [])).toEqual({ daily_cap_kcal: 1800 });
  });

  it('enforces foreign keys on the connection it prepares', async () => {
    await prepareDatabase(connection);

    const orphanEntry = connection.runAsync('INSERT INTO entries (day_key, kind, kcal) VALUES (?, ?, ?)', [
      '2026-10-04',
      'add',
      100,
    ]);

    await expect(orphanEntry).rejects.toThrow(/FOREIGN KEY/);
  });

  it.each([
    ['an unknown kind', 'eat', 100],
    ['zero kcal', 'add', 0],
    ['fractional kcal', 'add', 12.5],
  ])('refuses an entry row with %s', async (_label, kind, kcal) => {
    await prepareDatabase(connection);
    await connection.runAsync('INSERT INTO days (day_key, carry_over_kcal) VALUES (?, 0)', ['2026-10-04']);

    const entry = connection.runAsync('INSERT INTO entries (day_key, kind, kcal) VALUES (?, ?, ?)', [
      '2026-10-04',
      kind,
      kcal,
    ]);

    await expect(entry).rejects.toThrow();
  });
});
