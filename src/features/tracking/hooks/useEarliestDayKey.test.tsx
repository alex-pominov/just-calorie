import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { addEntry } from '../repositories/tracking.repository';
import { useEarliestDayKey } from './useEarliestDayKey';

describe('useEarliestDayKey', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;

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

  it('reads no earliest day from an empty database, then the first one written', async () => {
    const { result } = await renderHook(() => useEarliestDayKey(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ earliestDayKey: null }));

    await act(() => addEntry(database, { dayKey: '2026-09-12', kind: 'add', kcal: 400 }));

    await waitFor(() => expect(result.current).toEqual({ earliestDayKey: '2026-09-12' }));
  });

  it('moves back when an older day is written', async () => {
    await addEntry(database, { dayKey: '2026-09-12', kind: 'add', kcal: 400 });
    const { result } = await renderHook(() => useEarliestDayKey(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ earliestDayKey: '2026-09-12' }));

    await act(() => addEntry(database, { dayKey: '2026-06-30', kind: 'add', kcal: 400 }));

    await waitFor(() => expect(result.current).toEqual({ earliestDayKey: '2026-06-30' }));
  });
});
