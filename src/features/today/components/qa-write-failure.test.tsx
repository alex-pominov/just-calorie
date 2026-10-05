// QA reproduction (ms5-qa-r1): a write that fails must not vanish. The read path rethrows to the nearest
// error boundary (useDaySummary); the write paths call `void confirm()` / `void addKcal()`, so a rejected
// store becomes an unhandled promise rejection and the person sees nothing.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { Component } from 'react';
import { findNodeHandle, Pressable, Text, TextInput, View } from 'react-native';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import { toDayKey } from '@/features/tracking/services/day-key.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { TopUpSheet } from './TopUpSheet';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the timed test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, TextInput, View];

class CaughtError extends Component<{ children: ReactNode; onError: (error: unknown) => void }, { failed: boolean }> {
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

describe('QA: a failed store in the top-up', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;
  let failingWrite: jest.Mock;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  const openDatabase = async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);

    return createDatabase(connection);
  };
  const closeDatabase = async () => {
    await connection.closeAsync();
    file.remove();
  };

  // The sheet's first render, with its modules already loaded, so the timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    database = await openDatabase();
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={jest.fn()} />, {
      wrapper: ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>,
    });
    await screen.unmount();
    await closeDatabase();
  });

  beforeEach(async () => {
    const real = await openDatabase();
    await setDailyCap(real, { capKcal: 1200, todayKey: toDayKey(new Date()) });
    // SQLITE_FULL, IOERR and the like: the write rejects.
    failingWrite = jest.fn(() => Promise.reject(new Error('database or disk is full')));
    database = { ...real, write: failingWrite };
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(async () => {
    process.off('unhandledRejection', onUnhandled);
    unhandled.length = 0;
    await closeDatabase();
  });

  it('reaches an error boundary (or a visible message) instead of an unhandled rejection', async () => {
    const onError = jest.fn();
    const onDone = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = ({ children }: PropsWithChildren) => (
      <DatabaseContext value={database}>
        <CaughtError onError={onError}>{children}</CaughtError>
      </DatabaseContext>
    );
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });

    await fireEvent.changeText(screen.getByTestId('top-up-amount'), '250');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onDone).not.toHaveBeenCalled();
    const surfaced = onError.mock.calls.length > 0 || screen.queryByText(/could not|couldn.t|failed|error|try again/i) !== null;
    console.log(`QA write failure: write attempts ${failingWrite.mock.calls.length}, boundary calls ${onError.mock.calls.length}, unhandled rejections ${unhandled.length}`);
    expect({ surfaced, unhandled: unhandled.length }).toEqual({ surfaced: true, unhandled: 0 });
    await waitFor(() => undefined);
    consoleError.mockRestore();
  });
});
