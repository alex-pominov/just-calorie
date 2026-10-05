import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { findNodeHandle, Pressable, Text, TextInput, View } from 'react-native';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { addEntry, getDaySummary, setDailyCap, setDayCap } from '@/features/tracking/repositories/tracking.repository';
import { dateName } from '@/features/tracking/services/date-name.service';
import { shiftDayKey, toDayKey } from '@/features/tracking/services/day-key.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { EditCapSheet } from './EditCapSheet';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, TextInput, View];

describe('EditCapSheet', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;
  const onDone = jest.fn();

  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;
  const todayKey = () => toDayKey(new Date());
  const today = () => getDaySummary(database, todayKey());
  const cap = () => screen.getByTestId('edit-cap-amount');
  const confirm = () => screen.getByRole('button', { name: 'Confirm' });

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
    await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await screen.unmount();
    await closeDatabase();
  });

  beforeEach(async () => {
    await openDatabase();
    await setDailyCap(database, { capKcal: 1200, todayKey: todayKey() });
  });

  afterEach(closeDatabase);

  it('opens titled Daily Cap, pre-filled with the current cap and the number pad up', async () => {
    await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });

    await waitFor(() => expect(cap().props.value).toBe('1200'));
    expect(screen.getByText('Daily Cap')).toBeOnTheScreen();
    expect(cap().props).toMatchObject({ keyboardType: 'number-pad', autoFocus: true });
  });

  it('sets the cap typed, for the settings and for today, then closes', async () => {
    await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 800 });
    await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await waitFor(() => expect(cap().props.value).toBe('1200'));

    await fireEvent.changeText(cap(), '');
    await fireEvent.changeText(cap(), '700');
    await fireEvent.press(confirm());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(await today()).toMatchObject({ capKcal: 700, currentCapKcal: 700 });
  });

  it.each(['', '0'])('keeps the check disabled while the cap is %p, and changes nothing', async (typed) => {
    await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await waitFor(() => expect(cap().props.value).toBe('1200'));

    await fireEvent.changeText(cap(), typed);
    await fireEvent.press(confirm());

    expect(confirm().props.accessibilityState).toMatchObject({ disabled: true });
    expect(onDone).not.toHaveBeenCalled();
    expect((await today()).currentCapKcal).toBe(1200);
  });

  it('refuses a keystroke past 10,000 and keeps the cap it had', async () => {
    await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await waitFor(() => expect(cap().props.value).toBe('1200'));

    await fireEvent.changeText(cap(), '12000');

    expect(cap().props.value).toBe('1200');
  });

  it('changes nothing when it is dismissed without the check', async () => {
    const { unmount } = await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await waitFor(() => expect(cap().props.value).toBe('1200'));

    await fireEvent.changeText(cap(), '900');
    await unmount();

    expect((await today()).currentCapKcal).toBe(1200);
  });

  it('keeps the sheet open and says so when the cap cannot be saved, letting the person try again', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    database = { ...database, write: jest.fn(() => Promise.reject(new Error('database or disk is full'))) };
    await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
    await waitFor(() => expect(cap().props.value).toBe('1200'));

    await fireEvent.changeText(cap(), '');
    await fireEvent.changeText(cap(), '900');
    await fireEvent.press(confirm());

    expect(await screen.findByText("Couldn't save. Try again.")).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
    expect(confirm().props.accessibilityState).toMatchObject({ disabled: false });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
  describe('on a past day', () => {
    const yesterdayKey = () => shiftDayKey(toDayKey(new Date()), -1);

    it('names the day under its title, which it does not do for today', async () => {
      await render(<EditCapSheet dayKey={yesterdayKey()} onDone={onDone} />, { wrapper });
      await waitFor(() => expect(cap().props.value).toBe('1200'));

      expect(screen.getByTestId('past-day-caption')).toHaveTextContent(dateName(yesterdayKey()));

      await screen.unmount();
      await render(<EditCapSheet dayKey={todayKey()} onDone={onDone} />, { wrapper });
      await waitFor(() => expect(cap().props.value).toBe('1200'));
      expect(screen.queryByTestId('past-day-caption')).toBeNull();
    });

    it('opens pre-filled with that day’s own cap', async () => {
      await setDayCap(database, { dayKey: yesterdayKey(), capKcal: 1500 });

      await render(<EditCapSheet dayKey={yesterdayKey()} onDone={onDone} />, { wrapper });

      await waitFor(() => expect(cap().props.value).toBe('1500'));
    });

    it('sets that day’s cap alone, keeping the daily cap and today’s', async () => {
      await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 100 });
      await render(<EditCapSheet dayKey={yesterdayKey()} onDone={onDone} />, { wrapper });
      await waitFor(() => expect(cap().props.value).toBe('1200'));

      await fireEvent.changeText(cap(), '');
      await fireEvent.changeText(cap(), '900');
      await fireEvent.press(confirm());

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(await getDaySummary(database, yesterdayKey())).toMatchObject({ capKcal: 900, currentCapKcal: 1200 });
      expect(await today()).toMatchObject({ capKcal: 1200 });
    });
  });
});
