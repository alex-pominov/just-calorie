import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { createDatabase } from './database';
import type { Database } from './database.types';
import { prepareDatabase } from './prepare-database';

const INSERT_CAP = 'INSERT INTO settings (id, daily_cap_kcal) VALUES (1, ?)';
const SELECT_CAP = 'SELECT daily_cap_kcal AS capKcal FROM settings';

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve: () => resolve() };
};

describe('createDatabase', () => {
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

  it('notifies subscribers once a write has committed', async () => {
    const listener = jest.fn();
    database.subscribe(listener);

    await database.write((txn) => txn.runAsync(INSERT_CAP, [1800]).then(() => undefined));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(await database.read((reader) => reader.getFirstAsync(SELECT_CAP, []))).toEqual({ capKcal: 1800 });
  });

  it('rolls a failed write back without notifying subscribers', async () => {
    const listener = jest.fn();
    database.subscribe(listener);

    const write = database.write(async (txn) => {
      await txn.runAsync(INSERT_CAP, [1800]);
      throw new Error('abandoned');
    });

    await expect(write).rejects.toThrow('abandoned');
    expect(listener).not.toHaveBeenCalled();
    expect(await database.read((reader) => reader.getFirstAsync(SELECT_CAP, []))).toBeNull();
  });

  it('stops notifying a listener once it unsubscribes', async () => {
    const listener = jest.fn();
    const unsubscribe = database.subscribe(listener);

    unsubscribe();
    await database.write((txn) => txn.runAsync(INSERT_CAP, [1800]).then(() => undefined));

    expect(listener).not.toHaveBeenCalled();
  });

  it('holds a read until a running write has finished, so it never sees uncommitted rows', async () => {
    const inserted = deferred();
    const release = deferred();
    const write = database.write(async (txn) => {
      await txn.runAsync(INSERT_CAP, [1800]);
      inserted.resolve();
      await release.promise;
      throw new Error('abandoned');
    });
    await inserted.promise;

    const read = database.read((reader) => reader.getFirstAsync(SELECT_CAP, []));
    release.resolve();

    await expect(write).rejects.toThrow('abandoned');
    expect(await read).toBeNull();
  });

  it('runs the next write after a failed one', async () => {
    const failed = database.write(() => Promise.reject(new Error('abandoned')));

    const next = database.write((txn) => txn.runAsync(INSERT_CAP, [1800]).then(() => undefined));

    await expect(failed).rejects.toThrow('abandoned');
    await expect(next).resolves.toBeUndefined();
  });
});
