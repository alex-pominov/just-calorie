import { Dimensions, I18nManager, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { Database } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import { addEntry, setCarryOverDecision, setDailyCap } from '@/features/tracking/repositories/tracking.repository';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';
import { scrollOffsets } from '@/modules/theme';

import { CalendarScreen } from './CalendarScreen';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers. Under host load that cold load, inside the first test, outlasted its 5 s budget (backlog #6).
// The router reads I18nManager as it first renders, so it is touched here too.
const PRELOADED = [I18nManager, Pressable, ScrollView, Text, useWindowDimensions, View];

const classesOf = (element: { props: { className?: unknown } }) => String(element.props.className).split(' ');
const layoutEvent = (width: number, height: number, y = 0) => ({ nativeEvent: { layout: { x: 0, y, width, height } } });
const HEADER_HEIGHT = 146;
const setScreenWidth = (width: number) => {
  const height = 852;
  const metrics = { width, height, scale: 3, fontScale: 1 };

  Dimensions.set({ window: metrics, screen: metrics });
};
const rowGeometry = (testID: string) => {
  const row = screen.getByTestId(testID, { includeHiddenElements: true });
  const { paddingLeft, columnGap } = StyleSheet.flatten(row.props.style);
  const widths = row.children.map((slot) => (typeof slot === 'string' ? NaN : StyleSheet.flatten(slot.props.style).width));

  return { paddingLeft, columnGap, widths };
};
type HostNode = ReturnType<typeof screen.getByTestId>;
const accessibleNamesInTreeOrder = () => {
  const names: string[] = [];
  const walk = (node: HostNode | string) => {
    if (typeof node === 'string' || node.props.accessibilityElementsHidden) return;
    const { accessibilityRole, accessibilityLabel, accessible } = node.props;
    if (accessible === true || accessibilityRole === 'header' || accessibilityRole === 'button') {
      names.push(accessibilityLabel ?? node.children.filter((child) => typeof child === 'string').join(''));
    }
    node.children.forEach(walk);
  };
  if (screen.root !== null) walk(screen.root);

  return names;
};
const labelOf = (dayKey: string) => screen.getByTestId(`calendar-day-${dayKey}`).props.accessibilityLabel;

describe('CalendarScreen', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;

  const routes = {
    index: () => <Text testID="main-screen">main screen</Text>,
    calendar: () => (
      <DatabaseContext value={database}>
        <CalendarScreen />
      </DatabaseContext>
    ),
  };

  const openCalendar = async (todayKey = '2026-10-04') => {
    const rendered = renderRouter(routes, { initialUrl: '/calendar' });
    const { getPathname } = rendered;
    await rendered;
    await fireEvent(screen.getByTestId('calendar-header'), 'layout', layoutEvent(393, HEADER_HEIGHT));
    await waitFor(() => expect(screen.getByTestId(`calendar-day-${todayKey}`)).toBeOnTheScreen());

    return getPathname;
  };

  const openFixedDay = async () => {
    setScreenWidth(393);
    jest.useFakeTimers({ now: new Date(2026, 9, 4, 12, 0, 0) });
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
  };
  const closeFixedDay = async () => {
    jest.useRealTimers();
    await connection.closeAsync();
    file.remove();
  };

  // The screen's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openFixedDay();
    await openCalendar();
    await screen.unmount();
    await closeFixedDay();
  });

  beforeEach(async () => {
    await openFixedDay();
    await setDailyCap(database, { capKcal: 2000, todayKey: '2026-09-28' });
    await addEntry(database, { dayKey: '2026-09-28', kind: 'add', kcal: 2500 });
    await setCarryOverDecision(database, { dayKey: '2026-09-29', added: true });
    await addEntry(database, { dayKey: '2026-10-01', kind: 'add', kcal: 1200 });
    await addEntry(database, { dayKey: '2026-10-03', kind: 'add', kcal: 2000 });
  });

  afterEach(closeFixedDay);

  it('shows every stored day in its state, from the earliest recorded month through the upcoming one', async () => {
    await openCalendar();

    expect(screen.getByText('Calendar')).toBeOnTheScreen();
    expect(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => screen.getByText(label, { includeHiddenElements: true }))).toHaveLength(7);
    expect(screen.queryByText('Mo')).toBeNull();
    expect(['September', 'October', 'November'].map((title) => screen.getByText(title))).toHaveLength(3);
    expect(
      ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-11-01'].map(labelOf),
    ).toEqual([
      'Monday 28 September, over the cap, 2500 kcal',
      'Tuesday 29 September, unfilled, 500 kcal',
      'Thursday 1 October, on track, 1200 kcal',
      'Friday 2 October, unfilled, 0 kcal',
      'Saturday 3 October, on track, 2000 kcal',
      'Sunday 4 October, today',
      'Monday 5 October, future',
      'Sunday 1 November, future',
    ]);
  });

  it('titles a month from last year with its year and this year’s months by name alone', async () => {
    jest.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    await addEntry(database, { dayKey: '2025-12-31', kind: 'add', kcal: 1200 });

    await openCalendar('2026-01-15');

    expect(screen.getByText('December 2025')).toBeOnTheScreen();
    expect(screen.queryByText('December')).toBeNull();
    expect(['January', 'February'].map((title) => screen.getByText(title))).toHaveLength(2);
  });

  it('dims the whole upcoming month and leaves the others at full strength', async () => {
    await openCalendar();

    const [october, november] = ['2026-10', '2026-11'].map((monthKey) => screen.getByTestId(`calendar-month-${monthKey}`));

    expect(classesOf(november ?? screen.getByText('November'))).toContain('opacity-50');
    expect(classesOf(october ?? screen.getByText('October'))).not.toContain('opacity-50');
  });

  it.each([375, 393, 402, 440])(
    'puts each weekday heading over its day column, inside a %ppt screen',
    async (width) => {
      setScreenWidth(width);
      await openCalendar();

      const header = rowGeometry('calendar-weekday-row');
      const weeks = ['calendar-week-2026-09-28', 'calendar-week-2026-10-01', 'calendar-week-2026-10-26'].map(rowGeometry);

      expect(weeks).toEqual([header, header, header]);
      expect(header.widths).toHaveLength(7);
      expect(header.paddingLeft * 2 + header.widths.reduce((sum, w) => sum + w, 0) + header.columnGap * 6).toBeLessThanOrEqual(width);
    },
  );

  it('opens with the current month the frame’s offset below the header, once', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    await openCalendar();

    await fireEvent(screen.getByTestId('calendar-month-2026-10'), 'layout', layoutEvent(393, 400, 600));
    await fireEvent(screen.getByTestId('calendar-month-2026-10'), 'layout', layoutEvent(393, 400, 640));

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 600 - HEADER_HEIGHT - scrollOffsets['calendar-current-month'], animated: false });
  });

  it('stays at the top when the current month is the first one shown', async () => {
    await connection.closeAsync();
    file.remove();
    file = createTemporaryDatabaseFile();
    connection = openNodeSqliteDatabase(file.path);
    await prepareDatabase(connection);
    database = createDatabase(connection);
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    await openCalendar();

    await fireEvent(screen.getByTestId('calendar-month-2026-10'), 'layout', layoutEvent(393, 400, HEADER_HEIGHT));

    expect(screen.queryByTestId('calendar-month-2026-09')).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });

  it('shows a day’s new state when its entries change while the calendar is open', async () => {
    await openCalendar();

    await act(() => addEntry(database, { dayKey: '2026-10-01', kind: 'add', kcal: 900 }));

    await waitFor(() => expect(labelOf('2026-10-01')).toBe('Thursday 1 October, over the cap, 2100 kcal'));
  });

  it('reaches the title and Close before any day, in accessibility order', async () => {
    await openCalendar();

    const names = accessibleNamesInTreeOrder();

    expect(names.slice(0, 2)).toEqual(['Calendar', 'Close']);
    expect(names).toContain('Sunday 4 October, today');
  });

  it('closes to the main screen', async () => {
    const getPathname = await openCalendar();

    await fireEvent.press(screen.getByLabelText('Close'));

    expect(getPathname()).toBe('/');
    expect(screen.getByTestId('main-screen')).toBeOnTheScreen();
  });
});
