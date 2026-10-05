// QA reproduction (ms5-qa-r1): a pop-up route opened as the FIRST route (a cold-start deep link,
// justcalorie://top-up) must still close to the main screen after its check. app/top-up.tsx's onDone is
// router.back(), which has nothing to go back to when the sheet is the stack's only route.
import { router as expoRouter, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { PropsWithChildren } from 'react';
import { findNodeHandle, I18nManager, Pressable, Text, TextInput, useAnimatedValue, View } from 'react-native';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { getDaySummary, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import { toDayKey } from '@/features/tracking/services/day-key.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import EditCapRoute from '../../../../app/edit-cap';
import TopUpRoute from '../../../../app/top-up';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the timed test, can outlast its 5 s budget (backlog #8).
// The router reads I18nManager and useAnimatedValue as it first renders, so they are touched here too.
const PRELOADED = [findNodeHandle, I18nManager, Pressable, Text, TextInput, useAnimatedValue, View];

// app/_layout.tsx's Stack and sheet options, without RootProvider (expo-sqlite is native-only).
const SHEET = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: 'fitToContents',
  contentStyle: { backgroundColor: 'transparent' },
} as const;
const Layout = () => (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="top-up" options={SHEET} />
    <Stack.Screen name="edit-cap" options={SHEET} />
  </Stack>
);
const routes = {
  _layout: Layout,
  index: () => <Text>main screen</Text>,
  'top-up': TopUpRoute,
  'edit-cap': EditCapRoute,
};

describe('QA: a pop-up opened as the first route', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;
  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;
  const today = () => getDaySummary(database, toDayKey(new Date()));

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

  // The sheet's first render over the stack, with its modules already loaded, so the timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openDatabase();
    await renderRouter(routes, { initialUrl: '/top-up', wrapper });
    await screen.findByTestId('top-up-amount');
    await screen.unmount();
    // renderRouter switched to fake timers; the timed test starts on real ones, as it did before this warm-up.
    jest.useRealTimers();
    await closeDatabase();
  });

  beforeEach(async () => {
    await openDatabase();
    await setDailyCap(database, { capKcal: 1200, todayKey: toDayKey(new Date()) });
  });

  afterEach(closeDatabase);

  it('control: pushed over the main screen, the check stores and returns to it', async () => {
    const router = renderRouter(routes, { initialUrl: '/', wrapper });
    // The render settles before the first waitFor, so their act() scopes never overlap and drop the typed amount.
    await router;
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    await act(() => expoRouter.push('/top-up'));
    await waitFor(() => expect(router.getPathname()).toBe('/top-up'));

    await fireEvent.changeText(await screen.findByTestId('top-up-amount'), '250');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(router.getPathname()).toBe('/'));
    expect(await today()).toMatchObject({ entriesTotalKcal: 250 });
  });
});
