import { findNodeHandle, I18nManager, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { useCloseCalendar } from './useCloseCalendar';

const CloseProbe = () => {
  const close = useCloseCalendar();

  return (
    <Pressable testID="close" onPress={close}>
      <Text>calendar</Text>
    </Pressable>
  );
};

const routes = { index: () => <Text testID="main-screen">main screen</Text>, calendar: CloseProbe };

// renderRouter hangs its helpers on the promise RNTL 14's render returns, so they are read before awaiting it.
const openAt = async (initialUrl: string) => {
  const rendered = renderRouter(routes, { initialUrl });
  const { getPathname } = rendered;
  await rendered;

  return getPathname;
};

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
// The router reads I18nManager as it first renders, so it is touched here too.
const PRELOADED = [findNodeHandle, I18nManager, Pressable, Text, View];

describe('useCloseCalendar', () => {
  // The router's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openAt('/calendar');
    await screen.unmount();
    // renderRouter switched to fake timers; the tests start on real ones, as they did before this warm-up.
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('goes back to the screen that opened the calendar', async () => {
    const getPathname = await openAt('/');
    await act(() => router.push('/calendar'));

    await fireEvent.press(screen.getByTestId('close'));

    expect(getPathname()).toBe('/');
    expect(screen.getByTestId('main-screen')).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false);
  });

  it('replaces a deep-linked calendar with the main screen when there is nothing to go back to', async () => {
    const getPathname = await openAt('/calendar');
    expect(router.canGoBack()).toBe(false);

    await fireEvent.press(screen.getByTestId('close'));

    expect(getPathname()).toBe('/');
    expect(screen.getByTestId('main-screen')).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false);
  });
});
