import type { SqlConnection } from './database.types';

export async function runInTransaction(connection: SqlConnection, task: () => Promise<void>): Promise<void> {
  await connection.execAsync('BEGIN IMMEDIATE');

  try {
    await task();
    await connection.execAsync('COMMIT');
  } catch (error) {
    // SQLite ends the transaction itself on SQLITE_FULL, IOERR, BUSY and NOMEM. A ROLLBACK then throws
    // "no transaction is active" and replaces the error that explains the failure.
    if (await connection.isInTransactionAsync()) {
      await connection.execAsync('ROLLBACK');
    }

    throw error;
  }
}
