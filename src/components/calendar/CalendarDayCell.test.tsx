import { fireEvent, render, screen } from '@testing-library/react-native';
import { findNodeHandle, Pressable, Text, View } from 'react-native';

import { CalendarDayCell } from './CalendarDayCell';

import type { CalendarDayVariant } from './CalendarDayCell';

const classesOf = (element: { props: { className?: unknown } }) => String(element.props.className).split(' ');

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, View];

describe('CalendarDayCell', () => {
  // The cell's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await render(<CalendarDayCell variant="on-track" selected={false} weekday="Th" day="1" accessibilityLabel="Thursday 1" onPress={jest.fn()} />);
    await screen.unmount();
  });

  it.each<[CalendarDayVariant, { circle: string; day: string; weekday: string; disabled: boolean }]>([
    ['unfilled', { circle: 'bg-white-100', day: 'text-content-secondary', weekday: 'text-content-tertiary', disabled: false }],
    ['overaten', { circle: 'bg-over-surface', day: 'text-coral', weekday: 'text-content-tertiary', disabled: false }],
    ['on-track', { circle: 'bg-on-track-surface', day: 'text-lime', weekday: 'text-content-tertiary', disabled: false }],
    ['today', { circle: 'bg-primary', day: 'text-ink-950', weekday: 'text-content-tertiary', disabled: false }],
    ['tomorrow', { circle: 'bg-surface-disabled', day: 'text-content-disabled', weekday: 'text-content-disabled', disabled: true }],
  ])('renders the %s variant with its colours and accessibility state', async (variant, expected) => {
    await render(
      <CalendarDayCell variant={variant} selected={false} weekday="Mo" day="28" accessibilityLabel={`cell ${variant}`} />,
    );

    const cell = screen.getByLabelText(`cell ${variant}`);
    const day = screen.getByText('28');

    expect(cell.props.accessibilityState).toEqual({ selected: false, disabled: expected.disabled });
    expect(cell.props.accessibilityRole).toBe('text');
    expect(classesOf(screen.getByText('Mo'))).toContain(expected.weekday);
    expect(classesOf(day)).toContain(expected.day);
    expect(classesOf(day.parent ?? day)).toContain(expected.circle);
  });

  it.each<CalendarDayVariant>(['today', 'overaten', 'unfilled'])(
    'draws the selected %s day on the selected background, its weekday in white, keeping its own circle',
    async (variant) => {
      await render(<CalendarDayCell variant={variant} selected weekday="Sa" day="3" accessibilityLabel="shown day" />);

      const cell = screen.getByLabelText('shown day');

      expect(cell.props.accessibilityState).toMatchObject({ selected: true });
      expect(classesOf(cell)).toEqual(expect.arrayContaining(['rounded-full', 'bg-surface-selected']));
      expect(classesOf(screen.getByText('Sa'))).toContain('text-primary');
    },
  );

  it('draws an unselected day with no cell background', async () => {
    await render(<CalendarDayCell variant="today" selected={false} weekday="Sa" day="3" accessibilityLabel="today" />);

    expect(classesOf(screen.getByLabelText('today'))).not.toContain('bg-surface-selected');
  });

  it('is a button that reports a press when given onPress', async () => {
    const onPress = jest.fn();
    await render(<CalendarDayCell variant="on-track" selected={false} weekday="Th" day="1" accessibilityLabel="Thursday 1" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Thursday 1' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses on tomorrow', async () => {
    const onPress = jest.fn();
    await render(<CalendarDayCell variant="tomorrow" selected={false} weekday="Su" day="4" accessibilityLabel="Sunday 4" onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText('Sunday 4'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
