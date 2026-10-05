import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SqlConnection, SqlValue } from '@/modules/database/database.types';

export interface NodeSqliteDatabase extends SqlConnection {
  closeAsync(): Promise<void>;
}

export interface TemporaryDatabaseFile {
  path: string;
  remove(): void;
}

export function createTemporaryDatabaseFile(): TemporaryDatabaseFile {
  const directory = mkdtempSync(join(tmpdir(), 'just-calorie-'));

  return {
    path: join(directory, 'test.db'),
    remove: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export function openNodeSqliteDatabase(path: string): NodeSqliteDatabase {
  // expo-sqlite opens with foreign keys off; node:sqlite defaults them on, which would let a
  // test pass on an app that never enables them.
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: false });

  return {
    execAsync: async (source) => {
      database.exec(source);
    },
    runAsync: async (source, params: SqlValue[]) => database.prepare(source).run(...params),
    getFirstAsync: async (source, params: SqlValue[]) => {
      const row = database.prepare(source).get(...params);

      return row === undefined ? null : { ...row };
    },
    isInTransactionAsync: async () => database.isTransaction,
    closeAsync: async () => {
      database.close();
    },
  };
}
