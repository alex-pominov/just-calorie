import { cva } from 'class-variance-authority';
import { Pressable, Text } from 'react-native';

interface OvercapSelectorProps {
  added: boolean;
  label: string;
  /** What a screen reader says in place of the visible label; the label alone ("+400") says too little. */
  accessibilityLabel?: string | undefined;
  onPress?: (() => void) | undefined;
}

const selectorVariants = cva('flex-row items-center justify-center gap-2 rounded-full px-4 py-2', {
  variants: {
    added: {
      true: 'bg-coral',
      false: 'bg-over-surface-subtle',
    },
  },
});

const labelVariants = cva('text-center font-manrope-bold text-label', {
  variants: {
    added: {
      true: 'text-primary',
      false: 'text-coral',
    },
  },
});

export const OvercapSelector = ({ added, label, accessibilityLabel, onPress }: OvercapSelectorProps) => (
  <Pressable
    accessibilityRole="togglebutton"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ checked: added }}
    onPress={onPress}
    className={selectorVariants({ added })}
  >
    <Text className={labelVariants({ added })}>{label}</Text>
  </Pressable>
);
