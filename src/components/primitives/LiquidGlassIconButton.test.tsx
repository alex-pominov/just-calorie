import { findNodeHandle, Pressable, Text, View } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '@/modules/theme';

import { LiquidGlassIconButton } from './LiquidGlassIconButton';

jest.mock('expo-glass-effect', () => ({
  ...jest.requireActual<object>('expo-glass-effect'),
  isLiquidGlassAvailable: jest.fn(),
}));

const classesOf = (element: { props: { className?: unknown } }) => String(element.props.className).split(' ');

async function renderWithGlass(available: boolean, onPress?: () => void) {
  jest.mocked(isLiquidGlassAvailable).mockReturnValue(available);

  await render(<LiquidGlassIconButton icon={<Text>x</Text>} accessibilityLabel="Close" onPress={onPress} />);

  return screen.getByRole('button', { name: 'Close' });
}

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, View];

describe('LiquidGlassIconButton', () => {
  // The button's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await renderWithGlass(true);
    await screen.unmount();
  });

  it('renders a dark interactive Liquid Glass surface tinted White-50 where Liquid Glass is available', async () => {
    await renderWithGlass(true);

    const surface = screen.getByText('x').parent;

    expect(surface?.props).toMatchObject({
      glassEffectStyle: 'regular',
      colorScheme: 'dark',
      isInteractive: true,
      tintColor: colors['white-50'],
    });
  });

  it('falls back to a flat White-50 circle where Liquid Glass is unavailable', async () => {
    await renderWithGlass(false);

    const surface = screen.getByText('x').parent;

    expect(classesOf(surface ?? { props: {} })).toEqual(
      expect.arrayContaining(['h-12', 'w-12', 'rounded-full', 'bg-white-50']),
    );
  });

  it('reports a press under its required accessible name', async () => {
    const onPress = jest.fn();
    const button = await renderWithGlass(false, onPress);

    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the light confirm surface of the pop-ups, tinted Surface-Light, where Liquid Glass is available', async () => {
    jest.mocked(isLiquidGlassAvailable).mockReturnValue(true);

    await render(<LiquidGlassIconButton tone="light" icon={<Text>x</Text>} accessibilityLabel="Confirm" />);

    expect(screen.getByText('x').parent?.props).toMatchObject({
      colorScheme: 'light',
      tintColor: colors['surface-light'],
    });
  });

  it('falls back to a flat Surface-Light circle for the light tone', async () => {
    jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);

    await render(<LiquidGlassIconButton tone="light" icon={<Text>x</Text>} accessibilityLabel="Confirm" />);

    expect(classesOf(screen.getByText('x').parent ?? { props: {} })).toEqual(
      expect.arrayContaining(['h-12', 'w-12', 'rounded-full', 'bg-surface-light']),
    );
  });

  it('announces a disabled button as disabled and reports no press', async () => {
    const onPress = jest.fn();
    jest.mocked(isLiquidGlassAvailable).mockReturnValue(false);
    await render(<LiquidGlassIconButton icon={<Text>x</Text>} accessibilityLabel="Confirm" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Confirm' });

    await fireEvent.press(button);

    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(onPress).not.toHaveBeenCalled();
  });
});
