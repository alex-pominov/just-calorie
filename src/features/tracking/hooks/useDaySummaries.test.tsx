import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { Component } from 'react';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { InvalidDayKeyError } from '../services/day-key.service';
import type { DayRange } from '../types/day-log.types';
import { useAddEntry } from './useAddEntry';
import { useDaySummaries } from './useDaySummaries';
import { useSetCarryOverDecision } from './useSetCarryOverDecision';
import { useSetDailyCap } from './useSetDailyCap';

const DAY_1 = '2026-10-02';
const DAY_2 = '2026-10-03';
const DAY_3 = '2026-10-04';

interface CaughtErrorProps {
  children: ReactNode;
  onError: (error: unknown) => void;
}

class CaughtError extends Component<CaughtErrorProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

describe('useDaySummaries', () => {
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

  it('re-reads every day of the range from SQLite after each action', async () => {
    const { result } = await renderHook(
      () => ({
        days: useDaySummaries({ firstDayKey: DAY_1, lastDayKey: DAY_3 }),
        addEntry: useAddEntry(),
        setDailyCap: useSetDailyCap(),
        setCarryOverDecision: useSetCarryOverDecision(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.days?.map((day) => day.entryCount)).toEqual([0, 0, 0]));

    await act(() => result.current.setDailyCap({ capKcal: 1200, todayKey: DAY_1 }));
    await act(() => result.current.addEntry({ dayKey: DAY_1, kind: 'add', kcal: 1600 }));
    await act(() => result.current.setCarryOverDecision({ dayKey: DAY_2, added: true }));

    await waitFor(() =>
      expect(result.current.days?.map((day) => [day.dayKey, day.entryCount, day.totalKcal])).toEqual([
        [DAY_1, 1, 1600],
        [DAY_2, 0, 400],
        [DAY_3, 0, 0],
      ]),
    );
  });

  it('never returns the previous range’s days for a new range it has not read yet', async () => {
    const rendered: [string, string[] | null][] = [];
    const { result, rerender } = await renderHook(
      (range: DayRange) => {
        const days = useDaySummaries(range);
        rendered.push([range.firstDayKey, days?.map((day) => day.dayKey) ?? null]);

        return days;
      },
      { wrapper, initialProps: { firstDayKey: DAY_1, lastDayKey: DAY_1 } },
    );
    await waitFor(() => expect(result.current?.map((day) => day.dayKey)).toEqual([DAY_1]));

    await rerender({ firstDayKey: DAY_2, lastDayKey: DAY_3 });
    await waitFor(() => expect(result.current?.map((day) => day.dayKey)).toEqual([DAY_2, DAY_3]));

    const forNewRange = rendered.filter(([firstDayKey]) => firstDayKey === DAY_2).map(([, days]) => days);
    expect(forNewRange).toContainEqual(null);
    expect(forNewRange).not.toContainEqual([DAY_1]);
  });

  it('hands a failed read to the nearest error boundary', async () => {
    const onError = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const guardedWrapper = ({ children }: PropsWithChildren) => (
      <DatabaseContext value={database}>
        <CaughtError onError={onError}>{children}</CaughtError>
      </DatabaseContext>
    );

    await renderHook(() => useDaySummaries({ firstDayKey: 'not-a-day', lastDayKey: DAY_3 }), {
      wrapper: guardedWrapper,
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(InvalidDayKeyError)));
    consoleError.mockRestore();
  });
});
