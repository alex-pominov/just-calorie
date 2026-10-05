import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { getDaySummary, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import { toDayKey } from '@/features/tracking/services/day-key.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { useTopUp } from './useTopUp';

describe('useTopUp', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;

  beforeEach(async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
    await setDailyCap(database, { capKcal: 1200, todayKey: toDayKey(new Date()) });
  });

  afterEach(async () => {
    await connection.closeAsync();
    file.remove();
  });

  it('stores the amount once when it is confirmed twice before the screen updates', async () => {
    const onDone = jest.fn();
    const { result } = await renderHook(() => useTopUp(toDayKey(new Date()), onDone), { wrapper });
    await act(() => result.current.type('250'));
    const { confirm } = result.current;

    await act(async () => {
      await Promise.all([confirm(), confirm()]);
    });

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(await getDaySummary(database, toDayKey(new Date()))).toMatchObject({ entriesTotalKcal: 250 });
  });
});
