import { fireEvent, render, screen } from '@testing-library/react-native';
import { findNodeHandle, Pressable, Text } from 'react-native';

import { OvercapSelector } from './OvercapSelector';

const classesOf = (element: { props: { className?: unknown } }) => String(element.props.className).split(' ');

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text];

describe('OvercapSelector', () => {
  // The selector's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await render(<OvercapSelector added={false} label="+400" onPress={jest.fn()} />);
    await screen.unmount();
  });

  it.each([
    [true, 'bg-coral', 'text-primary'],
    [false, 'bg-over-surface-subtle', 'text-coral'],
  ])('renders added=%s with its checked state, background %s and text %s', async (added, background, text) => {
    await render(<OvercapSelector added={added} label="+400" />);

    const selector = screen.getByRole('togglebutton', { name: '+400' });

    expect(selector.props.accessibilityState).toEqual({ checked: added });
    expect(classesOf(selector)).toContain(background);
    expect(classesOf(screen.getByText('+400'))).toContain(text);
  });

  it('reports a press', async () => {
    const onPress = jest.fn();
    await render(<OvercapSelector added={false} label="+400" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('togglebutton', { name: '+400' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('can be named for a screen reader apart from its visible label, keeping its checked state', async () => {
    await render(<OvercapSelector added label="+400" accessibilityLabel="Yesterday's overage, 400 kcal" />);

    const selector = screen.getByRole('togglebutton', { name: "Yesterday's overage, 400 kcal" });

    expect(selector.props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByText('+400')).toBeOnTheScreen();
  });
});
