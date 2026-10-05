import { cva } from 'class-variance-authority';
import { Pressable, Text, View } from 'react-native';

export type TabOption = 'add' | 'remove';

interface TabProps {
  selected: TabOption;
  labels: Record<TabOption, string>;
  onSelect?: ((option: TabOption) => void) | undefined;
}

const OPTIONS = ['add', 'remove'] as const satisfies readonly TabOption[];

const segmentVariants = cva('w-20 flex-row items-center justify-center px-3 py-1.5', {
  variants: {
    selected: {
      true: 'rounded-sm bg-primary',
      false: '',
    },
  },
});

const labelVariants = cva('text-center font-manrope-bold text-label', {
  variants: {
    selected: {
      true: 'text-ink-950',
      false: 'text-primary',
    },
  },
});

export const Tab = ({ selected, labels, onSelect }: TabProps) => (
  <View accessibilityRole="tabbar" className="flex-row items-center gap-2 rounded-lg bg-white-100 p-1.5">
    {OPTIONS.map((option) => {
      const isSelected = option === selected;

      return (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          onPress={onSelect && (() => onSelect(option))}
          className={segmentVariants({ selected: isSelected })}
        >
          <Text className={labelVariants({ selected: isSelected })}>{labels[option]}</Text>
        </Pressable>
      );
    })}
  </View>
);
