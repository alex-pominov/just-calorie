import type { SqlConnection } from './database.types';
import { migrate } from './migrations';

// MUST run on every open, before any other query: `foreign_keys` is per connection and off by
// default, so skipping it silently stops SQLite enforcing every REFERENCES clause.
export async function prepareDatabase(connection: SqlConnection): Promise<void> {
  await connection.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(connection);
}
