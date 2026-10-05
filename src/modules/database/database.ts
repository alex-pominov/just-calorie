import type { Database, SqlConnection } from './database.types';
import { runInTransaction } from './transaction';

// Every read and write runs through ONE FIFO queue on ONE connection, so no query joins or
// observes another's open transaction. A second handle over the same connection has its own
// queue and silently breaks that — create exactly one per connection.
export function createDatabase(connection: SqlConnection): Database {
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = Promise.allSettled([result]);

    return result;
  };

  return {
    read: (task) => enqueue(() => task(connection)),
    write: async (task) => {
      await enqueue(() => runInTransaction(connection, () => task(connection)));
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
