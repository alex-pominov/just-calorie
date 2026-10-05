import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import type { PanGesture } from 'react-native-gesture-handler';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { PropsWithChildren } from 'react';

import type { Database, SqlReader } from '@/modules/database';
import { createDatabase } from '@/modules/database/database';
import { DatabaseContext } from '@/modules/database/database.context';
import { prepareDatabase } from '@/modules/database/prepare-database';
import type { SeedScenario } from '@/features/tracking';
import { addEntry, getDaySummary } from '@/features/tracking/repositories/tracking.repository';
import { shiftDayKey, toDayKey } from '@/features/tracking/services/day-key.service';
import { seedScenario } from '@/features/tracking/services/seed-scenario.service';
import type { NodeSqliteDatabase, TemporaryDatabaseFile } from '@tests/node-sqlite-database';
import { createTemporaryDatabaseFile, openNodeSqliteDatabase } from '@tests/node-sqlite-database';

import { TodayScreen } from './TodayScreen';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers. Under host load that cold load, inside the first test, outlasted its 5 s budget (backlog #4).
// Alert is first shown by a failed write, so it is touched here too.
const PRELOADED = [Alert, Pressable, ScrollView, Text, View];

describe('TodayScreen', () => {
  let file: TemporaryDatabaseFile;
  let connection: NodeSqliteDatabase;
  let database: Database;
  const handlers = {
    onOpenCalendar: jest.fn(),
    onTrackWithAi: jest.fn(),
    onOpenTopUp: jest.fn(),
    onEditCap: jest.fn(),
  };

  const wrapper = ({ children }: PropsWithChildren) => <DatabaseContext value={database}>{children}</DatabaseContext>;
  const todayKey = () => toDayKey(new Date());
  const renderScreen = () => render(<TodayScreen {...handlers} />, { wrapper });
  const seed = (scenario: SeedScenario) => seedScenario(database, { scenario, todayKey: todayKey() });
  const eatenFigure = () => screen.getByTestId('today-eaten');
  const leftLabel = () => screen.getByRole('button', { name: /kcal left$/ });
  const daysAgo = (days: number) => shiftDayKey(todayKey(), -days);
  const stripCells = () => within(screen.getByTestId('today-week-strip')).getAllByRole('button');
  // The strip ends on today and tomorrow, so the day `days` before today sits that many cells before today's.
  const stripCell = (days: number) => stripCells().at(-2 - days);
  const swipe = (translationX: number) =>
    act(() => {
      fireGestureHandler<PanGesture>(getByGestureTestId('today-day-swipe'), [
        { state: State.BEGAN, translationX: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX, velocityX: 0 },
        { state: State.END, translationX, velocityX: 0 },
      ]);
    });
  const swipeRight = () => swipe(120);
  const swipeLeft = () => swipe(-120);

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

  // The screen's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openDatabase();
    await renderScreen();
    await waitFor(() => expect(leftLabel()).toHaveTextContent('1200 from 1200 kcal left'));
    await screen.unmount();
    await closeDatabase();
  });

  beforeEach(openDatabase);

  afterEach(closeDatabase);

  it('stores the default cap on first launch and shows the empty day of frame 1:2', async () => {
    await renderScreen();

    await waitFor(() => expect(eatenFigure()).toHaveTextContent('0'));
    expect(leftLabel()).toHaveTextContent('1200 from 1200 kcal left');
    expect(screen.queryByRole('togglebutton')).toBeNull();
  });

  it.each<[SeedScenario, string, string]>([
    ['filled', '800', '400 from 1200 kcal left'],
    ['over', '1600', '0 from 1200 kcal left'],
    ['carry-added', '0', '800 from 1200 kcal left'],
    ['carry-withheld', '0', '1200 from 1200 kcal left'],
    ['carry-added-over', '1200', '0 from 1200 kcal left'],
  ])('shows the %s scenario’s figures', async (scenario, eaten, left) => {
    await seed(scenario);

    await renderScreen();

    await waitFor(() => expect(eatenFigure()).toHaveTextContent(eaten));
    expect(leftLabel()).toHaveTextContent(left);
  });

  it.each<[SeedScenario, boolean]>([
    ['carry-added', true],
    ['carry-withheld', false],
  ])('offers yesterday’s overage as +400 in the %s scenario, checked when added', async (scenario, checked) => {
    await seed(scenario);

    await renderScreen();

    const selector = await screen.findByRole('togglebutton', { name: "Yesterday's overage, 400 kcal" });
    expect(selector.props.accessibilityState).toEqual({ checked });
  });

  it('toggles the carry-over and follows it in the figures, read back from SQLite', async () => {
    await seed('carry-added');
    await renderScreen();
    const selector = await screen.findByRole('togglebutton', { name: "Yesterday's overage, 400 kcal" });

    await fireEvent.press(selector);

    await waitFor(() => expect(leftLabel()).toHaveTextContent('1200 from 1200 kcal left'));
    expect(
      screen.getByRole('togglebutton', { name: "Yesterday's overage, 400 kcal" }).props.accessibilityState,
    ).toEqual({ checked: false });
  });

  it.each([25, 50, 100])('stores %p kcal from its quick-add button and shows it at once', async (kcal) => {
    await renderScreen();
    await waitFor(() => expect(eatenFigure()).toHaveTextContent('0'));

    await fireEvent.press(screen.getByRole('button', { name: `Add ${kcal} kcal` }));

    await waitFor(() => expect(eatenFigure()).toHaveTextContent(String(kcal)));
  });

  it('follows a write made elsewhere, as the pop-ups will make them', async () => {
    await renderScreen();
    await waitFor(() => expect(eatenFigure()).toHaveTextContent('0'));

    await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 640 });

    await waitFor(() => expect(eatenFigure()).toHaveTextContent('640'));
  });

  it('labels the bowl with what was eaten against the cap', async () => {
    await seed('carry-added-over');

    await renderScreen();

    expect(
      await screen.findByLabelText('1200 kcal eaten and 400 kcal carried over, against a 1200 kcal cap: over the cap'),
    ).toBeOnTheScreen();
  });

  it('draws the week strip from 13 days back to tomorrow, judged by the shared rule', async () => {
    await seed('carry-added');

    await renderScreen();

    const strip = await screen.findByTestId('today-week-strip');
    await waitFor(() => expect(within(strip).getAllByLabelText(/, (on track|over the cap|nothing logged|today|tomorrow)$/)).toHaveLength(15));
    expect(within(strip).getAllByLabelText(/, over the cap$/)).toHaveLength(1);
    expect(within(strip).getAllByLabelText(/, today$/)).toHaveLength(1);
  });

  it.each([
    ['Open calendar', 'onOpenCalendar'],
    ['Track with AI', 'onTrackWithAi'],
    ['Add another amount', 'onOpenTopUp'],
  ] as const)('calls %s’s handler', async (name, handler) => {
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name }));

    expect(handlers[handler]).toHaveBeenCalledTimes(1);
  });

  it('opens the cap editor from the left-to-eat label', async () => {
    await renderScreen();
    await waitFor(() => expect(leftLabel()).toHaveTextContent('1200 from 1200 kcal left'));

    await fireEvent.press(leftLabel());

    expect(handlers.onEditCap).toHaveBeenCalledTimes(1);
  });

  it('fits a five-digit Eaten on one line clear of the +400 pill, shrinking it rather than overlapping', async () => {
    await seed('carry-added');
    await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 10000 });
    await addEntry(database, { dayKey: todayKey(), kind: 'add', kcal: 1200 });

    await renderScreen();

    await waitFor(() => expect(eatenFigure()).toHaveTextContent('11200'));
    expect(eatenFigure().props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    expect(String(eatenFigure().props.className)).toContain('inset-x-20');
  });

  it('gives the Eaten figure the full width when there is no pill to keep clear of', async () => {
    await seed('over');

    await renderScreen();

    await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));
    expect(String(eatenFigure().props.className)).toContain('inset-x-0');
    expect(String(eatenFigure().props.className)).not.toContain('inset-x-20');
  });

  // iOS fits a shrink-to-fit Text to its box's height as well as its width, and the 100px line is shorter
  // than the font's own (on device the digits drew at 54pt where Figma's are 73pt).
  it('draws the Eaten figure out of the line’s flow, so fitting it to one line can only narrow it', async () => {
    await seed('filled');

    await renderScreen();

    await waitFor(() => expect(eatenFigure()).toHaveTextContent('800'));
    expect(String(eatenFigure().props.className)).toContain('absolute');
    expect(String(eatenFigure().parent?.props.className)).toContain('h-25 justify-center');
  });

  describe('switching days', () => {
    it('goes back a day on a swipe right, showing that day’s figures', async () => {
      await seed('over');
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));

      await swipeRight();

      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1000'));
      expect(leftLabel()).toHaveTextContent('200 from 1200 kcal left');
      expect(stripCell(1)?.props.accessibilityState).toMatchObject({ selected: true });
    });

    it('re-pours the bowl for the day it switches to: a fresh bowl, not the last day’s retargeted', async () => {
      await seed('over');
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));
      const todaysBowl = screen.getByTestId('skia-canvas').props.nativeID;

      await swipeRight();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1000'));

      expect(screen.getByTestId('skia-canvas').props.nativeID).not.toBe(todaysBowl);
    });

    it('goes forward a day on a swipe left, stopping at today', async () => {
      await seed('over');
      await renderScreen();
      await waitFor(() => expect(stripCells()).toHaveLength(15));
      await fireEvent.press(stripCell(1)!);
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1000'));

      await swipeLeft();
      await swipeLeft();

      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));
      expect(stripCell(0)?.props.accessibilityState).toMatchObject({ selected: true });
    });

    it('stays on the day when a drag far enough to switch is cancelled', async () => {
      await seed('over');
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));

      await act(() => {
        fireGestureHandler<PanGesture>(getByGestureTestId('today-day-swipe'), [
          { state: State.BEGAN, translationX: 0, velocityX: 0 },
          { state: State.ACTIVE, translationX: 120, velocityX: 0 },
          { state: State.CANCELLED, translationX: 120, velocityX: 0 },
        ]);
      });

      expect(eatenFigure()).toHaveTextContent('1600');
      expect(stripCell(0)?.props.accessibilityState).toMatchObject({ selected: true });
    });

    it('stays on the day after a short slow drag', async () => {
      await seed('over');
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));

      await swipe(30);

      expect(eatenFigure()).toHaveTextContent('1600');
    });

    it('selects a week-strip day when it is tapped, and marks it selected', async () => {
      await seed('over');
      await renderScreen();
      await waitFor(() => expect(stripCells()).toHaveLength(15));

      await fireEvent.press(stripCell(3)!);

      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1150'));
      expect(stripCell(3)?.props.accessibilityState).toMatchObject({ selected: true });
      expect(stripCell(0)?.props.accessibilityState).toMatchObject({ selected: false });
      expect(within(screen.getByTestId('today-week-strip')).getAllByLabelText(/, today$/)).toHaveLength(1);
    });

    it('widens the week strip to keep a week before a day shown further back than its fortnight', async () => {
      await renderScreen();
      await waitFor(() => expect(stripCells()).toHaveLength(15));

      await fireEvent.press(stripCell(13)!);

      await waitFor(() => expect(stripCells()).toHaveLength(22));
      expect(stripCell(13)?.props.accessibilityState).toMatchObject({ selected: true });
    });

    it('writes an action taken before a newly shown day is read to the day still on screen', async () => {
      await seed('over');
      const real = database;
      let readsPaused: Promise<void> = Promise.resolve();
      let resumeReads = () => {};
      database = {
        ...real,
        read: async <T,>(task: (reader: SqlReader) => Promise<T>): Promise<T> => {
          await readsPaused;
          return real.read(task);
        },
      };
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));
      readsPaused = new Promise((resume) => {
        resumeReads = resume;
      });

      await swipeRight();
      await fireEvent.press(screen.getByRole('button', { name: 'Add 25 kcal' }));
      const shownDuringHold = [eatenFigure().props.children, stripCell(0)?.props.accessibilityState.selected];
      resumeReads();

      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1000'));
      expect(shownDuringHold).toEqual([1600, true]);
      expect(await getDaySummary(real, todayKey())).toMatchObject({ entriesTotalKcal: 1625 });
      expect(await getDaySummary(real, daysAgo(1))).toMatchObject({ entriesTotalKcal: 1000 });
    });

    it('stores a quick add on the past day shown, and leaves today alone', async () => {
      await seed('over');
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1600'));
      await swipeRight();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1000'));

      await fireEvent.press(screen.getByRole('button', { name: 'Add 25 kcal' }));

      await waitFor(() => expect(eatenFigure()).toHaveTextContent('1025'));
      expect(await getDaySummary(database, todayKey())).toMatchObject({ entriesTotalKcal: 1600 });
    });

    it('opens the pop-ups and Track with AI on the day shown', async () => {
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('0'));
      await swipeRight();
      await waitFor(() => expect(stripCell(1)?.props.accessibilityState).toMatchObject({ selected: true }));

      await fireEvent.press(screen.getByRole('button', { name: 'Add another amount' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Track with AI' }));
      await fireEvent.press(leftLabel());

      expect(handlers.onOpenTopUp).toHaveBeenCalledWith(daysAgo(1));
      expect(handlers.onTrackWithAi).toHaveBeenCalledWith(daysAgo(1));
      expect(handlers.onEditCap).toHaveBeenCalledWith(daysAgo(1));
    });

    it('offers a past day the previous day’s overage, and adding it there recomputes today’s', async () => {
      await seed('carry-added');
      await addEntry(database, { dayKey: daysAgo(2), kind: 'add', kcal: 1500 });
      await renderScreen();
      await screen.findByRole('togglebutton', { name: "Yesterday's overage, 400 kcal" });
      await swipeRight();

      await fireEvent.press(await screen.findByRole('togglebutton', { name: "The previous day's overage, 300 kcal" }));
      await waitFor(() => expect(leftLabel()).toHaveTextContent('0 from 1200 kcal left'));
      await swipeLeft();

      expect(await screen.findByRole('togglebutton', { name: "Yesterday's overage, 700 kcal" })).toBeOnTheScreen();
    });
  });

  describe('when a write fails', () => {
    const failWrites = () => {
      const real = database;
      database = { ...real, write: jest.fn(() => Promise.reject(new Error('database or disk is full'))) };
    };

    it('says so after a quick add, rather than losing the tap silently', async () => {
      await seed('empty');
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      failWrites();
      await renderScreen();
      await waitFor(() => expect(eatenFigure()).toHaveTextContent('0'));

      await fireEvent.press(screen.getByRole('button', { name: 'Add 25 kcal' }));

      await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save", 'Try again.'));
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it('says so after the carry-over selector is pressed', async () => {
      await seed('carry-added');
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      failWrites();
      await renderScreen();

      await fireEvent.press(await screen.findByRole('togglebutton', { name: "Yesterday's overage, 400 kcal" }));

      await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save", 'Try again.'));
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
