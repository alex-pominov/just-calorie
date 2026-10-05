import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { findNodeHandle, Pressable, Text, TextInput, View } from 'react-native';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { addEntry, getDaySummary, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import { dateName } from '@/features/tracking/services/date-name.service';
import { shiftDayKey, toDayKey } from '@/features/tracking/services/day-key.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { TopUpSheet } from './TopUpSheet';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, TextInput, View];

describe('TopUpSheet', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;
  const onDone = jest.fn();

  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;
  const today = () => getDaySummary(database, toDayKey(new Date()));
  const amount = () => screen.getByTestId('top-up-amount');
  const confirm = () => screen.getByRole('button', { name: 'Confirm' });
  const eat = (kcal: number) => addEntry(database, { dayKey: toDayKey(new Date()), kind: 'add', kcal });
  // Types into the amount field and reports whether the field kept it (the eaten amount loads asynchronously).
  const amountAccepts = (typed: string) => {
    fireEvent.changeText(amount(), typed);

    return amount().props.value === typed;
  };

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
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });
    await screen.unmount();
    await closeDatabase();
  });

  beforeEach(async () => {
    await openDatabase();
    await setDailyCap(database, { capKcal: 1200, todayKey: toDayKey(new Date()) });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await closeDatabase();
  });

  it('opens on the Add tab with the number pad, a plus sign and a 0 placeholder', async () => {
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });

    expect(screen.getByRole('button', { name: 'Add' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('top-up-sign', { includeHiddenElements: true }).props.value).toBe('+');
    expect(amount().props).toMatchObject({ value: '', placeholder: '0', keyboardType: 'number-pad', autoFocus: true });
  });

  it('stores the amount typed as an addition, then closes', async () => {
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });

    await fireEvent.changeText(amount(), '250');
    await fireEvent.press(confirm());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(await today()).toMatchObject({ entriesTotalKcal: 250 });
  });

  it('stores a removal from the Remove tab, shown with a minus sign', async () => {
    await eat(300);
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(amountAccepts('100')).toBe(true));
    expect(screen.getByTestId('top-up-sign', { includeHiddenElements: true }).props.value).toBe('-');
    await fireEvent.press(confirm());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(await today()).toMatchObject({ entriesTotalKcal: 200 });
  });

  it('removes at most what today shows eaten, refusing the keystroke that would pass it', async () => {
    await eat(300);
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(amountAccepts('30')).toBe(true));
    await fireEvent.changeText(amount(), '301');

    expect(amount().props.value).toBe('30');
  });

  it('removes exactly what today shows eaten, taking the day to zero', async () => {
    await eat(300);
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(amountAccepts('300')).toBe(true));
    await fireEvent.press(confirm());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(await today()).toMatchObject({ entriesTotalKcal: 0 });
  });

  it('shows a removal the store refuses as a failed save and stays open', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await eat(200);
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(amountAccepts('200')).toBe(true));

    const concurrentRemoval = addEntry(database, { dayKey: toDayKey(new Date()), kind: 'remove', kcal: 100 });
    await fireEvent.press(confirm());
    await concurrentRemoval;

    expect(await screen.findByText("Couldn't save. Try again.")).toBeOnTheScreen();
    expect(onDone).not.toHaveBeenCalled();
    expect(await today()).toMatchObject({ entriesTotalKcal: 100 });
  });

  it('keeps the check disabled when an amount typed on Add is more than Remove may take', async () => {
    await eat(300);
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });
    await fireEvent.changeText(amount(), '500');

    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    await fireEvent.press(confirm());

    expect(confirm().props.accessibilityState).toMatchObject({ disabled: true });
    expect(onDone).not.toHaveBeenCalled();
    expect(await today()).toMatchObject({ entriesTotalKcal: 300 });
  });

  it('accepts nothing on the Remove tab when nothing has been eaten today', async () => {
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));

    await fireEvent.changeText(amount(), '5');

    expect(amount().props.value).toBe('');
  });

  it.each(['', '0'])('keeps the check disabled while the amount is %p, and stores nothing', async (typed) => {
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });

    await fireEvent.changeText(amount(), typed);
    await fireEvent.press(confirm());

    expect(confirm().props.accessibilityState).toMatchObject({ disabled: true });
    expect(onDone).not.toHaveBeenCalled();
    expect(await today()).toMatchObject({ isRecorded: false });
  });

  it('refuses a keystroke past 10,000 and keeps the amount it had', async () => {
    await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });

    await fireEvent.changeText(amount(), '1000');
    await fireEvent.changeText(amount(), '10001');

    expect(amount().props.value).toBe('1000');
  });

  it('stores nothing when it is dismissed without the check', async () => {
    const { unmount } = await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });

    await fireEvent.changeText(amount(), '250');
    await unmount();

    expect(await today()).toMatchObject({ isRecorded: false, entriesTotalKcal: 0 });
  });
  describe('on a past day', () => {
    const yesterdayKey = () => shiftDayKey(toDayKey(new Date()), -1);
    const yesterday = () => getDaySummary(database, yesterdayKey());

    it('names the day it writes to, which it does not do for today', async () => {
      await render(<TopUpSheet dayKey={yesterdayKey()} onDone={onDone} />, { wrapper });

      expect(screen.getByTestId('past-day-caption')).toHaveTextContent(dateName(yesterdayKey()));

      await screen.unmount();
      await render(<TopUpSheet dayKey={toDayKey(new Date())} onDone={onDone} />, { wrapper });
      expect(screen.queryByTestId('past-day-caption')).toBeNull();
    });

    it('adds to and removes from the day it opened on, leaving today alone', async () => {
      await addEntry(database, { dayKey: yesterdayKey(), kind: 'add', kcal: 900 });
      await render(<TopUpSheet dayKey={yesterdayKey()} onDone={onDone} />, { wrapper });

      await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(amountAccepts('300')).toBe(true));
      await fireEvent.press(confirm());

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(await yesterday()).toMatchObject({ entriesTotalKcal: 600 });
      expect(await today()).toMatchObject({ isRecorded: false, entriesTotalKcal: 0 });
    });

    it('removes at most what that day shows eaten, not what today does', async () => {
      await eat(2000);
      await addEntry(database, { dayKey: yesterdayKey(), kind: 'add', kcal: 400 });
      await render(<TopUpSheet dayKey={yesterdayKey()} onDone={onDone} />, { wrapper });

      await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(amountAccepts('400')).toBe(true));

      expect(amountAccepts('401')).toBe(false);
      expect(amount().props.value).toBe('400');
    });
  });
});
