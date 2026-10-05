import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { useDaySummary } from './useDaySummary';
import { useSeedScenario } from './useSeedScenario';

const TODAY = '2026-10-03';

describe('useSeedScenario', () => {
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

  it('replaces the stored days with the scenario, and a mounted summary re-reads it', async () => {
    const { result } = await renderHook(() => ({ today: useDaySummary(TODAY), seed: useSeedScenario() }), { wrapper });
    await waitFor(() => expect(result.current.today).toMatchObject({ isRecorded: false }));

    await act(() => result.current.seed({ scenario: 'carry-added-over', todayKey: TODAY }));

    await waitFor(() =>
      expect(result.current.today).toMatchObject({ entriesTotalKcal: 1200, carryOverKcal: 400, totalKcal: 1600 }),
    );
  });
});
