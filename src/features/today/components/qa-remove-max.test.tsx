// QA reproduction (ms5-qa-r1 f-8aebf1, re-targeted at the Lead's ms6 ruling, item 2): the Remove tab never
// takes the day below zero. Its maximum is today's eaten (max(0, entriesTotalKcal)); a digit past it is
// refused (as MAX_KCAL is), a larger amount already in the field disables the check, and with eaten 0 the
// Remove tab accepts nothing. Replaces qa-negative-day.test.tsx's display case, which the ruling supersedes
// ("an already-negative day still displays eaten 0").
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { findNodeHandle, Pressable, Text, TextInput, View } from 'react-native';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { addEntry, getDaySummary, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import { toDayKey } from '@/features/tracking/services/day-key.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { TopUpSheet } from './TopUpSheet';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, TextInput, View];

describe('QA: the Remove tab never takes the day below zero', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;
  const onDone = jest.fn();
  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;
  const todayKey = () => toDayKey(new Date());
  const net = async () => (await getDaySummary(database, todayKey())).entriesTotalKcal;
  const amount = () => screen.getByTestId('top-up-amount');
  const confirm = () => screen.getByRole('button', { name: 'Confirm' });
  // One keystroke at a time, as the number pad delivers them.
  const typeKeys = async (digits: string) => {
    for (let end = 1; end <= digits.length; end += 1) {
      await fireEvent.changeText(amount(), `${amount().props.value ?? ''}${digits[end - 1]}`);
    }
  };
  const openRemove = async () => {
    await render(<TopUpSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
  };
  // The sheet reads today's eaten from SQLite; give it one read before typing.
  const settle = () => waitFor(() => expect(amount()).toBeTruthy());

  const openDatabase = async () => {
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
  };
  const closeDatabase = async () => {
    await connection.closeAsync();
    file.remove();
  };

  // The sheet's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openDatabase();
    await render(<TopUpSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await screen.unmount();
    await closeDatabase();
  });

  beforeEach(async () => {
    await openDatabase();
    await setDailyCap(database, { capKcal: 1200, todayKey: todayKey() });
    onDone.mockClear();
  });

  afterEach(closeDatabase);

  it('refuses the keystroke that would remove more than today’s eaten (1050), and never stores below zero', async () => {
    await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 1050 });
    await openRemove();
    await settle();

    await typeKeys('2000'); // the slipped digit for 200
    await waitFor(() => expect(amount().props.value).toBe('200'));
    await fireEvent.press(confirm());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(await net()).toBe(850);
  });

  it('allows removing exactly today’s eaten, to zero', async () => {
    await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 1050 });
    await openRemove();
    await settle();

    await typeKeys('1050');
    await waitFor(() => expect(amount().props.value).toBe('1050'));
    await fireEvent.press(confirm());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(await net()).toBe(0);
  });

  it('disables the check when an amount already in the field is above the maximum (2000 typed on Add, then Remove)', async () => {
    await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 1050 });
    await render(<TopUpSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await settle();
    await typeKeys('2000');
    await waitFor(() => expect(amount().props.value).toBe('2000'));

    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(confirm().props.accessibilityState).toMatchObject({ disabled: true }));
    await fireEvent.press(confirm());

    expect(onDone).not.toHaveBeenCalled();
    expect(await net()).toBe(1050);
  });

  it('accepts nothing on the Remove tab when nothing is eaten', async () => {
    await openRemove();
    await settle();

    await typeKeys('5');
    await fireEvent.press(confirm());

    expect(onDone).not.toHaveBeenCalled();
    expect(await net()).toBe(0);
    expect(confirm().props.accessibilityState).toMatchObject({ disabled: true });
  });
});
