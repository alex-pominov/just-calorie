import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { PropsWithChildren } from 'react';
import { findNodeHandle, I18nManager, Pressable, Text, TextInput, useAnimatedValue, View } from 'react-native';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { getDaySummary, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import { dateName } from '@/features/tracking/services/date-name.service';
import { shiftDayKey, toDayKey } from '@/features/tracking/services/day-key.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import EditCapRoute from '../../../../app/edit-cap';
import TopUpRoute from '../../../../app/top-up';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them (backlog #8).
const PRELOADED = [findNodeHandle, I18nManager, Pressable, Text, TextInput, useAnimatedValue, View];

const SHEET = { presentation: 'formSheet', sheetAllowedDetents: 'fitToContents' } as const;
const Layout = () => (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="top-up" options={SHEET} />
    <Stack.Screen name="edit-cap" options={SHEET} />
  </Stack>
);
const routes = { _layout: Layout, index: () => <Text>main screen</Text>, 'top-up': TopUpRoute, 'edit-cap': EditCapRoute };

describe('the pop-up routes’ day parameter', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;
  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;
  const todayKey = () => toDayKey(new Date());
  const daysAgo = (days: number) => shiftDayKey(todayKey(), -days);
  const openAt = async (url: string) => {
    await renderRouter(routes, { initialUrl: url, wrapper });
  };
  const addOnTopUp = async (kcal: string) => {
    await fireEvent.changeText(await screen.findByTestId('top-up-amount'), kcal);
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
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

  // The sheet's first render over the stack, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openDatabase();
    await openAt('/top-up');
    await screen.findByTestId('top-up-amount');
    await screen.unmount();
    jest.useRealTimers();
    await closeDatabase();
  });

  beforeEach(async () => {
    await openDatabase();
    await setDailyCap(database, { capKcal: 1200, todayKey: todayKey() });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await closeDatabase();
  });

  it('adds to the past day a link names, and names it', async () => {
    await openAt(`/top-up?day=${daysAgo(3)}`);

    await addOnTopUp('250');

    await waitFor(async () => expect(await getDaySummary(database, daysAgo(3))).toMatchObject({ entriesTotalKcal: 250 }));
    expect(await getDaySummary(database, todayKey())).toMatchObject({ entriesTotalKcal: 0 });
  });

  it.each([
    ['a day after today', shiftDayKey(toDayKey(new Date()), 1)],
    ['a day more than a year back', shiftDayKey(toDayKey(new Date()), -366)],
    ['a malformed day', '2026-02-30'],
  ])('adds to today for %s, with no caption', async (_label, day) => {
    await openAt(`/top-up?day=${day}`);
    await screen.findByTestId('top-up-amount');
    expect(screen.queryByTestId('past-day-caption')).toBeNull();

    await addOnTopUp('100');

    await waitFor(async () => expect(await getDaySummary(database, todayKey())).toMatchObject({ entriesTotalKcal: 100 }));
  });

  it('edits the cap of the past day a link names, captioned with its date, and keeps the daily cap', async () => {
    await openAt(`/edit-cap?day=${daysAgo(2)}`);
    await waitFor(() => expect(screen.getByTestId('edit-cap-amount').props.value).toBe('1200'));
    expect(screen.getByTestId('past-day-caption')).toHaveTextContent(dateName(daysAgo(2)));

    await fireEvent.changeText(screen.getByTestId('edit-cap-amount'), '');
    await fireEvent.changeText(screen.getByTestId('edit-cap-amount'), '900');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(async () => expect(await getDaySummary(database, daysAgo(2))).toMatchObject({ capKcal: 900 }));
    expect(await getDaySummary(database, todayKey())).toMatchObject({ currentCapKcal: 1200 });
  });
});
