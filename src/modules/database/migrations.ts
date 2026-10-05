import { runInTransaction } from './transaction';
import type { SqlConnection } from './database.types';
import { readNumber } from './sql-row';

// Append-only: a shipped entry is never edited or reordered, because its index + 1 is the
// `user_version` already stamped on devices that ran it.
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    daily_cap_kcal INTEGER NOT NULL CHECK (daily_cap_kcal > 0)
  ) STRICT;

  CREATE TABLE days (
    day_key TEXT PRIMARY KEY NOT NULL CHECK (day_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    cap_kcal INTEGER CHECK (cap_kcal > 0),
    carry_over_kcal INTEGER NOT NULL CHECK (carry_over_kcal >= 0),
    carry_over_added INTEGER CHECK (carry_over_added IN (0, 1))
  ) STRICT;

  CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    day_key TEXT NOT NULL REFERENCES days (day_key),
    kind TEXT NOT NULL CHECK (kind IN ('add', 'remove')),
    kcal INTEGER NOT NULL CHECK (kcal > 0),
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
  ) STRICT;

  CREATE INDEX entries_by_day ON entries (day_key);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(connection: SqlConnection): Promise<void> {
  const appliedVersion = readNumber(await connection.getFirstAsync('PRAGMA user_version', []), 'user_version');

  for (const [index, migration] of MIGRATIONS.entries()) {
    const version = index + 1;

    if (version > appliedVersion) {
      await runInTransaction(connection, async () => {
        await connection.execAsync(migration);
        await connection.execAsync(`PRAGMA user_version = ${version}`);
      });
    }
  }
}
