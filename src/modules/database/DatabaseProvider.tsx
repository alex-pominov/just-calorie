import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';

import { createDatabase } from './database';
import { DatabaseContext } from './database.context';
import { prepareDatabase } from './prepare-database';

const DATABASE_NAME = 'just-calorie.db';

export const DatabaseProvider = ({ children }: PropsWithChildren) => (
  <SQLiteProvider databaseName={DATABASE_NAME} onInit={prepareDatabase}>
    <DatabaseHandleProvider>{children}</DatabaseHandleProvider>
  </SQLiteProvider>
);

const DatabaseHandleProvider = ({ children }: PropsWithChildren) => {
  const connection = useSQLiteContext();
  // State, not memo: React may drop a memo, and a second handle would run a second queue.
  const [database] = useState(() => createDatabase(connection));

  return <DatabaseContext value={database}>{children}</DatabaseContext>;
};
