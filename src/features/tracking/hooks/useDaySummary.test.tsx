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
import { useAddEntry } from './useAddEntry';
import { useDaySummary } from './useDaySummary';
import { useSetCarryOverDecision } from './useSetCarryOverDecision';
import { useSetDailyCap } from './useSetDailyCap';

const DAY_1 = '2026-10-02';
const DAY_2 = '2026-10-03';

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

describe('tracking hooks', () => {
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

  it('re-reads the day summary from SQLite after each action', async () => {
    const { result } = await renderHook(
      () => ({
        today: useDaySummary(DAY_2),
        addEntry: useAddEntry(),
        setDailyCap: useSetDailyCap(),
        setCarryOverDecision: useSetCarryOverDecision(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.today).toMatchObject({ isRecorded: false }));

    await act(() => result.current.setDailyCap({ capKcal: 2000, todayKey: DAY_1 }));
    await act(() => result.current.addEntry({ dayKey: DAY_1, kind: 'add', kcal: 2300 }));

    await waitFor(() => expect(result.current.today).toMatchObject({ currentCapKcal: 2000, carryOverKcal: 300 }));

    await act(() => result.current.addEntry({ dayKey: DAY_2, kind: 'add', kcal: 400 }));
    await act(() => result.current.setCarryOverDecision({ dayKey: DAY_2, added: true }));

    await waitFor(() =>
      expect(result.current.today).toMatchObject({ isRecorded: true, carryOverAdded: true, totalKcal: 700 }),
    );
  });

  it('hands a failed read to the nearest error boundary', async () => {
    const onError = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const guardedWrapper = ({ children }: PropsWithChildren) => (
      <DatabaseContext value={database}>
        <CaughtError onError={onError}>{children}</CaughtError>
      </DatabaseContext>
    );

    await renderHook(() => useDaySummary('not-a-day'), { wrapper: guardedWrapper });

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(InvalidDayKeyError)));
    consoleError.mockRestore();
  });
});
