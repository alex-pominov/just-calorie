import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { addEntry, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { useCalendarDays } from './useCalendarDays';

describe('useCalendarDays', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;

  beforeEach(async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
    await setDailyCap(database, { capKcal: 2000, todayKey: '2026-10-01' });
  });

  afterEach(async () => {
    await connection.closeAsync();
    file.remove();
  });

  it('judges every day from the 1st of the earliest recorded month through today, and names the earliest one', async () => {
    await addEntry(database, { dayKey: '2026-10-03', kind: 'add', kcal: 2500 });
    await addEntry(database, { dayKey: '2026-10-02', kind: 'add', kcal: 1200 });

    const { result } = await renderHook(() => useCalendarDays('2026-10-05'), { wrapper });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.earliestDayKey).toBe('2026-10-02');
    expect(Object.fromEntries(result.current?.byDayKey ?? [])).toEqual({
      '2026-10-01': { status: 'unfilled', totalKcal: 0 },
      '2026-10-02': { status: 'on-track', totalKcal: 1200 },
      '2026-10-03': { status: 'overaten', totalKcal: 2500 },
      '2026-10-04': { status: 'unfilled', totalKcal: 0 },
      '2026-10-05': { status: 'unfilled', totalKcal: 0 },
    });
  });

  it('re-reads after a write to the database', async () => {
    await addEntry(database, { dayKey: '2026-10-01', kind: 'add', kcal: 1200 });
    const { result } = await renderHook(() => useCalendarDays('2026-10-04'), { wrapper });
    await waitFor(() => expect(result.current?.byDayKey.get('2026-10-01')).toEqual({ status: 'on-track', totalKcal: 1200 }));

    await act(() => addEntry(database, { dayKey: '2026-10-01', kind: 'add', kcal: 900 }));

    await waitFor(() => expect(result.current?.byDayKey.get('2026-10-01')).toEqual({ status: 'overaten', totalKcal: 2100 }));
  });

  it('reads only the current month, every day unfilled, when nothing is recorded', async () => {
    const { result } = await renderHook(() => useCalendarDays('2026-10-02'), { wrapper });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.earliestDayKey).toBeNull();
    expect(Object.fromEntries(result.current?.byDayKey ?? [])).toEqual({
      '2026-10-01': { status: 'unfilled', totalKcal: 0 },
      '2026-10-02': { status: 'unfilled', totalKcal: 0 },
    });
  });
});
