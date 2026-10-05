import { Stack } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { findNodeHandle, I18nManager, Text, useAnimatedValue, View } from 'react-native';

import { ROOT_STACK_SETTINGS, SHEET_OPTIONS } from './navigation';

const Layout = () => (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="top-up" options={SHEET_OPTIONS} />
    <Stack.Screen name="edit-cap" options={SHEET_OPTIONS} />
  </Stack>
);

const routes = {
  _layout: { default: Layout, unstable_settings: ROOT_STACK_SETTINGS },
  index: () => <Text>main screen</Text>,
  'top-up': () => <Text>top-up</Text>,
  'edit-cap': () => <Text>edit-cap</Text>,
};

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the timed test, can outlast its 5 s budget (backlog #8).
// The router reads I18nManager and useAnimatedValue as it first renders, so they are touched here too.
const PRELOADED = [findNodeHandle, I18nManager, Text, useAnimatedValue, View];

describe('root stack settings', () => {
  // The stack's first render, with its modules already loaded, so the timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await renderRouter(routes, { initialUrl: '/top-up' });
    await screen.unmount();
    // renderRouter switched to fake timers; the timed test starts on real ones, as it did before this warm-up.
    jest.useRealTimers();
  });

  it('puts the main screen under a pop-up a link opens first', async () => {
    const router = renderRouter(routes, { initialUrl: '/top-up' });
    // The render settles before the first waitFor, so their act() scopes never overlap.
    await router;

    await waitFor(() => expect(router.getPathname()).toBe('/top-up'));
    const stack = router.getRouterState()?.routes[0]?.state?.routes.map((route) => route.name);

    expect(stack).toEqual(['index', 'top-up']);
  });
});
