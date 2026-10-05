import { use } from 'react';

import { DatabaseContext } from './database.context';
import type { Database } from './database.types';

export function useDatabase(): Database {
  const database = use(DatabaseContext);

  if (database === null) {
    throw new Error('useDatabase must be called inside DatabaseProvider');
  }

  return database;
}
