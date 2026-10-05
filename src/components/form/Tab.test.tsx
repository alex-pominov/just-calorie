import { fireEvent, render, screen } from '@testing-library/react-native';
import { findNodeHandle, Pressable, Text, View } from 'react-native';

import { Tab } from './Tab';

import type { TabOption } from './Tab';

const LABELS = { add: 'Add', remove: 'Remove' };
const classesOf = (element: { props: { className?: unknown } }) => String(element.props.className).split(' ');

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, View];

describe('Tab', () => {
  // The tab bar's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await render(<Tab selected="add" labels={LABELS} onSelect={jest.fn()} />);
    await screen.unmount();
  });

  it.each<[TabOption, string, string]>([
    ['add', 'Add', 'Remove'],
    ['remove', 'Remove', 'Add'],
  ])('renders the %s variant with %s as the selected tab', async (selected, selectedLabel, otherLabel) => {
    await render(<Tab selected={selected} labels={LABELS} />);

    const selectedTab = screen.getByRole('button', { name: selectedLabel });
    const otherTab = screen.getByRole('button', { name: otherLabel });

    expect(selectedTab.parent?.props.accessibilityRole).toBe('tabbar');
    expect(selectedTab).toBeSelected();
    expect(otherTab).not.toBeSelected();
    expect(classesOf(selectedTab)).toContain('bg-primary');
    expect(classesOf(otherTab)).not.toContain('bg-primary');
    expect(classesOf(screen.getByText(selectedLabel))).toContain('text-ink-950');
    expect(classesOf(screen.getByText(otherLabel))).toContain('text-primary');
  });

  it('reports the option the user pressed', async () => {
    const onSelect = jest.fn();
    await render(<Tab selected="add" labels={LABELS} onSelect={onSelect} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));

    expect(onSelect).toHaveBeenCalledWith('remove');
  });
});
