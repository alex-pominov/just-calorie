export type SqlValue = string | number | null;

export interface SqlReader {
  /** The first row, or null when there is none; read its columns through `readNumber`. */
  getFirstAsync(source: string, params: SqlValue[]): Promise<unknown>;
}

export interface SqlExecutor extends SqlReader {
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
}

/** The expo-sqlite `SQLiteDatabase` methods this module calls, and all a test adapter implements. */
export interface SqlConnection extends SqlExecutor {
  execAsync(source: string): Promise<void>;
  isInTransactionAsync(): Promise<boolean>;
}

export interface Database {
  read<T>(task: (reader: SqlReader) => Promise<T>): Promise<T>;
  /** One transaction, then subscribers are notified; calling this handle inside `task` deadlocks. */
  write(task: (txn: SqlExecutor) => Promise<void>): Promise<void>;
  subscribe(listener: () => void): () => void;
}
