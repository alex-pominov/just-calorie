import { cva } from 'class-variance-authority';
import { Pressable, Text, View } from 'react-native';

export type CalendarDayVariant = 'unfilled' | 'overaten' | 'on-track' | 'today' | 'tomorrow';

interface CalendarDayCellProps {
  variant: CalendarDayVariant;
  /** The day the screen shows: Figma draws it on today's pill, so a selected past day keeps its own circle on it. */
  selected: boolean;
  weekday: string;
  day: string;
  accessibilityLabel: string;
  onPress?: (() => void) | undefined;
}

const cellVariants = cva('items-center gap-1 px-1 pb-1 pt-2', {
  variants: {
    selected: {
      true: 'rounded-full bg-surface-selected',
      false: '',
    },
  },
});

// The selected day's weekday is white whatever its state; tomorrow is never selected.
const weekdayVariants = cva('self-stretch text-center font-manrope-semibold text-caption', {
  variants: {
    tone: {
      selected: 'text-primary',
      plain: 'text-content-tertiary',
      disabled: 'text-content-disabled',
    },
  },
});

function weekdayTone(variant: CalendarDayVariant, selected: boolean): 'selected' | 'plain' | 'disabled' {
  if (selected) return 'selected';

  return variant === 'tomorrow' ? 'disabled' : 'plain';
}

const circleVariants = cva('h-9 w-9 justify-center rounded-full', {
  variants: {
    variant: {
      unfilled: 'bg-white-100',
      overaten: 'bg-over-surface',
      'on-track': 'bg-on-track-surface',
      today: 'bg-primary',
      tomorrow: 'bg-surface-disabled',
    },
  },
});

const dayVariants = cva('text-center font-manrope-bold text-label', {
  variants: {
    variant: {
      unfilled: 'text-content-secondary',
      overaten: 'text-coral',
      'on-track': 'text-lime',
      today: 'text-ink-950',
      tomorrow: 'text-content-disabled',
    },
  },
});

export const CalendarDayCell = ({ variant, selected, weekday, day, accessibilityLabel, onPress }: CalendarDayCellProps) => (
  <Pressable
    accessible
    accessibilityRole={onPress ? 'button' : 'text'}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ selected, disabled: variant === 'tomorrow' }}
    disabled={variant === 'tomorrow'}
    onPress={onPress}
    className={cellVariants({ selected })}
  >
    <Text className={weekdayVariants({ tone: weekdayTone(variant, selected) })}>{weekday}</Text>
    <View className={circleVariants({ variant })}>
      <Text className={dayVariants({ variant })}>{day}</Text>
    </View>
  </Pressable>
);
