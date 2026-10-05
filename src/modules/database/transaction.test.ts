import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { prepareDatabase } from './prepare-database';
import { runInTransaction } from './transaction';

describe('runInTransaction', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;

  beforeEach(async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
  });

  afterEach(async () => {
    await connection.closeAsync();
    file.remove();
  });

  it('rethrows the failure itself when SQLite has already rolled the transaction back', async () => {
    const failure = new Error('database or disk is full');

    const run = runInTransaction(connection, async () => {
      await connection.execAsync('ROLLBACK');
      throw failure;
    });

    await expect(run).rejects.toBe(failure);
  });

  it('rolls back what an open transaction wrote before rethrowing its failure', async () => {
    const failure = new Error('task failed');

    const run = runInTransaction(connection, async () => {
      await connection.runAsync('INSERT INTO settings (id, daily_cap_kcal) VALUES (1, ?)', [1500]);
      throw failure;
    });

    await expect(run).rejects.toBe(failure);
    expect(await connection.getFirstAsync('SELECT daily_cap_kcal FROM settings', [])).toBeNull();
  });
});
