import { render, screen } from '@testing-library/react-native';
import { findNodeHandle, Text, View } from 'react-native';

import type { CalendarMonthDayCellProps } from './CalendarMonthDayCell';
import { CalendarMonthBlankCell, CalendarMonthDayCell } from './CalendarMonthDayCell';

const classesOf = (element: { props: { className?: unknown } }) => String(element.props.className).split(' ');

const renderCell = (props: CalendarMonthDayCellProps) => render(<CalendarMonthDayCell testID="cell" {...props} />);

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Text, View];

describe('CalendarMonthDayCell', () => {
  // The cell's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await renderCell({ variant: 'on-track', tone: 'weekday', day: '7', figure: '1200', accessibilityLabel: 'Wednesday 7 October, on-track' });
    await screen.unmount();
  });

  it.each([
    ['on-track', 'text-lime'],
    ['overaten', 'text-coral'],
    ['unfilled', 'text-content-faint'],
  ] as const)('shows a %s day as its number over a figure coloured %s', async (variant, figureColour) => {
    await renderCell({ variant, tone: 'weekday', day: '7', figure: '1200', accessibilityLabel: `Wednesday 7 October, ${variant}` });

    const cell = screen.getByTestId('cell');
    const figure = screen.getByText('1200');

    expect(cell.props.accessibilityLabel).toBe(`Wednesday 7 October, ${variant}`);
    expect(cell.props.accessibilityRole).toBe('text');
    expect(classesOf(cell)).toEqual(expect.arrayContaining(['h-14', 'justify-center', 'gap-0.5']));
    expect(classesOf(cell)).not.toContain('bg-primary');
    expect(classesOf(screen.getByText('7'))).toEqual(
      expect.arrayContaining(['font-manrope-semibold', 'text-body', 'text-primary', 'text-center']),
    );
    expect(classesOf(figure)).toEqual(expect.arrayContaining(['font-manrope-semibold', 'text-figure', figureColour, 'text-center']));
  });

  it('shows today as a white tile with a dark number and no figure', async () => {
    await renderCell({ variant: 'today', tone: 'weekend', day: '4', accessibilityLabel: 'Sunday 4 October, today' });

    const cell = screen.getByTestId('cell');
    const number = screen.getByText('4');

    expect(classesOf(cell)).toEqual(expect.arrayContaining(['h-14', 'rounded-md', 'bg-primary']));
    expect(classesOf(number)).toContain('text-ink-950');
    expect(classesOf(number)).not.toContain('text-content-muted');
    expect(cell.props.accessibilityLabel).toBe('Sunday 4 October, today');
    expect(screen.getAllByText(/./)).toHaveLength(1);
  });

  it('shows a future day as its number alone', async () => {
    await renderCell({ variant: 'future', tone: 'weekday', day: '30', accessibilityLabel: 'Friday 30 October, future' });

    const cell = screen.getByTestId('cell');

    expect(classesOf(cell)).not.toContain('bg-primary');
    expect(classesOf(screen.getByText('30'))).toContain('text-primary');
    expect(screen.getAllByText(/./)).toHaveLength(1);
  });

  it('dims the number on the weekend columns', async () => {
    await renderCell({ variant: 'on-track', tone: 'weekend', day: '3', figure: '1200', accessibilityLabel: 'Saturday 3 October' });

    const number = screen.getByText('3');

    expect(classesOf(number)).toContain('text-content-muted');
    expect(classesOf(number)).not.toContain('text-primary');
  });

  it('keeps a blank cell the height of a day cell, hidden from assistive technology', async () => {
    await render(<CalendarMonthBlankCell testID="blank" />);

    const blank = screen.getByTestId('blank', { includeHiddenElements: true });

    expect(classesOf(blank)).toContain('h-14');
    expect(blank.props.importantForAccessibility ?? blank.props.accessibilityElementsHidden).toBeTruthy();
  });
});
