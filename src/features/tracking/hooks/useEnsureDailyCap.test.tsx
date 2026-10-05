import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { Component } from 'react';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { getDaySummary } from '../repositories/tracking.repository';
import { DEFAULT_DAILY_CAP_KCAL } from '../services/kcal.service';
import { useEnsureDailyCap } from './useEnsureDailyCap';

const TODAY = '2026-10-03';

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

describe('useEnsureDailyCap', () => {
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

  it('stores the default cap on first launch and reports when it is in place', async () => {
    const { result } = await renderHook(() => useEnsureDailyCap(), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
    expect((await getDaySummary(database, TODAY)).currentCapKcal).toBe(DEFAULT_DAILY_CAP_KCAL);
  });

  it('runs the step once per database however many screens ask for it', async () => {
    const write = jest.spyOn(database, 'write');
    const read = jest.spyOn(database, 'read');

    const first = await renderHook(() => useEnsureDailyCap(), { wrapper });
    const second = await renderHook(() => useEnsureDailyCap(), { wrapper });

    await waitFor(() => expect([first.result.current, second.result.current]).toEqual([true, true]));
    expect(write).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('hands a failed step to the nearest error boundary', async () => {
    const onError = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('disk full');
    jest.spyOn(database, 'read').mockRejectedValue(failure);
    const guardedWrapper = ({ children }: PropsWithChildren) => (
      <DatabaseContext value={database}>
        <CaughtError onError={onError}>{children}</CaughtError>
      </DatabaseContext>
    );

    await renderHook(() => useEnsureDailyCap(), { wrapper: guardedWrapper });

    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    consoleError.mockRestore();
  });
});
