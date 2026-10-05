import { router as expoRouter, Stack } from 'expo-router';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { findNodeHandle, I18nManager, Text, useAnimatedValue, View } from 'react-native';

import { closeSheet } from './close-sheet';

const Layout = () => (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="top-up" options={{ presentation: 'formSheet' }} />
  </Stack>
);

const routes = { _layout: Layout, index: () => <Text>main screen</Text>, 'top-up': () => <Text>pop-up</Text> };

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
// The router reads I18nManager and useAnimatedValue as it first renders, so they are touched here too.
const PRELOADED = [findNodeHandle, I18nManager, Text, useAnimatedValue, View];

describe('closeSheet', () => {
  // The stack's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await renderRouter(routes, { initialUrl: '/top-up' });
    await screen.unmount();
    // renderRouter switched to fake timers; the tests start on real ones, as they did before this warm-up.
    jest.useRealTimers();
  });

  it('goes back to the screen the pop-up was opened over', async () => {
    const router = renderRouter(routes, { initialUrl: '/' });
    // The render settles before the first waitFor, so their act() scopes never overlap.
    await router;
    await waitFor(() => expect(router.getPathname()).toBe('/'));
    await act(() => expoRouter.push('/top-up'));
    await waitFor(() => expect(router.getPathname()).toBe('/top-up'));

    await act(() => closeSheet());

    await waitFor(() => expect(router.getPathname()).toBe('/'));
  });

  it('opens the main screen when the pop-up has nothing under it, never stranding the person', async () => {
    const router = renderRouter(routes, { initialUrl: '/top-up' });
    await router;
    await waitFor(() => expect(router.getPathname()).toBe('/top-up'));

    await act(() => closeSheet());

    await waitFor(() => expect(router.getPathname()).toBe('/'));
  });
});
