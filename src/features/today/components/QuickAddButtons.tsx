import { Pressable, Text, View } from 'react-native';

const QUICK_ADD_KCAL = [5, 25, 100] as const;

interface QuickAddButtonsProps {
  onAdd: (kcal: number) => void;
  onOther: () => void;
}

interface QuickAddButtonProps {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}

// Figma pads each button 16 a side, which on its own 393pt screen leaves "other" 52.25pt for a 52.4pt word, so iOS
// wrapped it onto two lines. The row sets each button's width and the label is centred, so 12 a side draws the same.
const QuickAddButton = ({ label, accessibilityLabel, onPress }: QuickAddButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    className="flex-1 items-center justify-center rounded-full bg-white-100 px-3 py-5 active:bg-white-50"
  >
    <Text className="font-manrope-bold text-subtitle text-primary">{label}</Text>
  </Pressable>
);

// Figma Button Group 7:3014.
export const QuickAddButtons = ({ onAdd, onOther }: QuickAddButtonsProps) => (
  <View className="flex-row items-center gap-2 self-stretch">
    {QUICK_ADD_KCAL.map((kcal) => (
      <QuickAddButton key={kcal} label={`+ ${kcal}`} accessibilityLabel={`Add ${kcal} kcal`} onPress={() => onAdd(kcal)} />
    ))}
    <QuickAddButton label="other" accessibilityLabel="Add another amount" onPress={onOther} />
  </View>
);
