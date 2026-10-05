import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { PropsWithChildren } from 'react';
import { findNodeHandle, I18nManager, Text, useAnimatedValue, View } from 'react-native';

import RootLayout, { unstable_settings } from '../../app/_layout';

// The app's own root layout, so the options it gives each screen are the ones read below. Its stylesheet and its
// providers (the database, the status bar) play no part in how the stack presents a route.
jest.mock('../../global.css', () => ({}));
jest.mock('@/providers/RootProvider', () => ({ RootProvider: ({ children }: PropsWithChildren) => children }));

const routes = {
  _layout: { default: RootLayout, unstable_settings },
  index: () => <Text>main screen</Text>,
  calendar: () => <Text>calendar</Text>,
  track: () => <Text>track</Text>,
  'top-up': () => <Text>top-up</Text>,
  'edit-cap': () => <Text>edit-cap</Text>,
};

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the timed test, can outlast its 5 s budget (backlog #8).
// The router reads I18nManager and useAnimatedValue as it first renders, so they are touched here too.
const PRELOADED = [findNodeHandle, I18nManager, Text, useAnimatedValue, View];

type RenderedRouter = ReturnType<typeof renderRouter>;

/** How the native stack presents each route it holds, read off the native screen it renders for that route. */
const presentations = (router: RenderedRouter) =>
  Object.fromEntries(
    (router.getRouterState()?.routes[0]?.state?.routes ?? []).map(({ name }) => [
      name,
      // A native screen's id is its route's name and a generated suffix.
      screen.root?.queryAll((node) => String(node.props.screenId).startsWith(`${name}-`))[0]?.props.stackPresentation,
    ]),
  );

describe('root stack settings', () => {
  // The stack's first render, with its modules already loaded, so the timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await renderRouter(routes, { initialUrl: '/top-up' });
    await screen.unmount();
    // renderRouter switched to fake timers; the timed test starts on real ones, as it did before this warm-up.
    jest.useRealTimers();
  });

  it.each(['top-up', 'edit-cap'])('presents the %s pop-up as a sheet, over the main screen when a link opens it', async (name) => {
    const router = renderRouter(routes, { initialUrl: `/${name}` });
    // The render settles before the first waitFor, so their act() scopes never overlap.
    await router;

    await waitFor(() => expect(router.getPathname()).toBe(`/${name}`));
    const stack = router.getRouterState()?.routes[0]?.state?.routes.map((route) => route.name);

    expect(stack).toEqual(['index', name]);
    expect(presentations(router)).toEqual({ index: 'push', [name]: 'formSheet' });
  });

  it.each([
    ['/calendar', 'calendar'],
    ['/track?day=2026-10-01', 'track'],
  ])('presents %s full screen from the bottom, over the main screen when a link opens it', async (url, name) => {
    const router = renderRouter(routes, { initialUrl: url });
    await router;

    await waitFor(() => expect(router.getPathname()).toBe(`/${name}`));
    const stack = router.getRouterState()?.routes[0]?.state?.routes.map((route) => route.name);

    expect(stack).toEqual(['index', name]);
    expect(presentations(router)).toEqual({ index: 'push', [name]: 'fullScreenModal' });
  });
});
