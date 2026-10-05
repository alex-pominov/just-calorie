import { cva } from 'class-variance-authority';
import { Text, View } from 'react-native';

import { cn } from '@/utils/tailwind';

export type CalendarMonthDayTone = 'weekday' | 'weekend';

interface CellBaseProps {
  tone: CalendarMonthDayTone;
  day: string;
  accessibilityLabel: string;
  testID?: string | undefined;
}

interface JudgedDayCellProps extends CellBaseProps {
  variant: 'on-track' | 'overaten' | 'unfilled';
  figure: string;
}

interface PlainDayCellProps extends CellBaseProps {
  variant: 'today' | 'future';
}

export type CalendarMonthDayCellProps = JudgedDayCellProps | PlainDayCellProps;

interface CalendarMonthBlankCellProps {
  testID?: string | undefined;
}

// The width is the column's: CalendarWeekRow sizes it.
const CELL = 'h-14';

const cellVariants = cva(cn(CELL, 'justify-center gap-0.5'), {
  variants: {
    variant: {
      'on-track': '',
      overaten: '',
      unfilled: '',
      today: 'rounded-md bg-primary',
      future: '',
    },
  },
});

const numberVariants = cva('text-center font-manrope-semibold text-body', {
  variants: {
    tone: { weekday: 'text-primary', weekend: 'text-content-muted' },
    variant: { 'on-track': '', overaten: '', unfilled: '', today: 'text-ink-950', future: '' },
  },
});

const figureVariants = cva('text-center font-manrope-semibold text-figure', {
  variants: {
    variant: { 'on-track': 'text-lime', overaten: 'text-coral', unfilled: 'text-content-faint' },
  },
});

/** One day of frame 9:3396's month grid; display-only, so it is never pressable. */
export const CalendarMonthDayCell = (props: CalendarMonthDayCellProps) => (
  <View
    accessible
    accessibilityRole="text"
    accessibilityLabel={props.accessibilityLabel}
    testID={props.testID}
    className={cellVariants({ variant: props.variant })}
  >
    <Text className={cn(numberVariants({ tone: props.tone, variant: props.variant }))}>{props.day}</Text>
    {'figure' in props ? <Text className={figureVariants({ variant: props.variant })}>{props.figure}</Text> : null}
  </View>
);

/** Holds a grid column before a month's first day. */
export const CalendarMonthBlankCell = ({ testID }: CalendarMonthBlankCellProps) => (
  <View accessibilityElementsHidden testID={testID} className={CELL} />
);
