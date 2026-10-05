import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { addEntry, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import type { CalendarDay, CalendarMonth } from '../types/calendar.types';
import { useCalendarMonths } from './useCalendarMonths';

const dayIn = (months: readonly CalendarMonth[] | null, dayKey: string): CalendarDay | undefined =>
  months
    ?.flatMap((month) => month.weeks.flat())
    .find((day): day is CalendarDay => day !== null && day.dayKey === dayKey);

describe('useCalendarMonths', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;

  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 4, 12, 0, 0) });
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
    await setDailyCap(database, { capKcal: 2000, todayKey: '2026-09-29' });
    await addEntry(database, { dayKey: '2026-09-29', kind: 'add', kcal: 2500 });
    await addEntry(database, { dayKey: '2026-10-02', kind: 'add', kcal: 1200 });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await connection.closeAsync();
    file.remove();
  });

  it('lays out the stored days from the earliest recorded month through the upcoming one around today', async () => {
    const { result } = await renderHook(() => useCalendarMonths(), { wrapper });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.map((month) => month.monthKey)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(
      ['2026-09-29', '2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'].map((dayKey) => {
        const day = dayIn(result.current, dayKey);

        return [dayKey, day?.state, day?.figureKcal];
      }),
    ).toEqual([
      ['2026-09-29', 'overaten', 2500],
      ['2026-10-01', 'unfilled', 0],
      ['2026-10-02', 'on-track', 1200],
      ['2026-10-04', 'today', null],
      ['2026-10-05', 'future', null],
    ]);
  });

  it('shows a day’s new state after its entries change', async () => {
    const { result } = await renderHook(() => useCalendarMonths(), { wrapper });
    await waitFor(() => expect(dayIn(result.current, '2026-10-02')?.state).toBe('on-track'));

    await act(() => addEntry(database, { dayKey: '2026-10-02', kind: 'add', kcal: 1000 }));

    await waitFor(() => expect(dayIn(result.current, '2026-10-02')).toMatchObject({ state: 'overaten', figureKcal: 2200 }));
  });
});
