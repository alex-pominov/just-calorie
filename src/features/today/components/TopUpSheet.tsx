import { TextInput, View } from 'react-native';

import { CheckIcon } from '@/assets/icons';
import { Tab } from '@/components/form';
import { LiquidGlassIconButton } from '@/components/primitives';
import { colors } from '@/modules/theme';
import { cn } from '@/utils/tailwind';

import { useTopUp } from '../hooks/useTopUp';
import { PastDayCaption } from './PastDayCaption';
import { SaveFailedLine } from './SaveFailedLine';

interface TopUpSheetProps {
  /** The day the amount is added to or removed from. */
  dayKey: string;
  onDone: () => void;
}

const TAB_LABELS = { add: 'Add', remove: 'Remove' };
// The sign is a read-only field so it is drawn with the digits' own text metrics; as a Text it sits ~28px lower.
const AMOUNT = 'font-manrope-semibold text-amount';

// Figma 5:70 (Add) and 5:1613 (Remove); the number pad below it is the system's.
export const TopUpSheet = ({ dayKey, onDone }: TopUpSheetProps) => {
  const { kind, text, canConfirm, hasFailed, selectKind, type, confirm } = useTopUp(dayKey, onDone);
  const isRemove = kind === 'remove';

  return (
    <View className="px-4 pb-4 pt-16">
      <View className="h-20 flex-row items-center justify-center">
        <TextInput
          testID="top-up-sign"
          value={isRemove ? '-' : '+'}
          editable={false}
          pointerEvents="none"
          accessibilityElementsHidden
          className={cn(AMOUNT, isRemove ? 'text-coral' : 'text-primary')}
        />
        <TextInput
          testID="top-up-amount"
          accessibilityLabel={isRemove ? 'Kcal to remove' : 'Kcal to add'}
          value={text}
          onChangeText={type}
          placeholder="0"
          placeholderTextColor={isRemove ? colors['coral-faint'] : colors['content-disabled']}
          selectionColor={isRemove ? colors.coral : colors.primary}
          keyboardType="number-pad"
          autoFocus
          className={cn(AMOUNT, isRemove ? 'text-coral' : 'text-primary')}
        />
      </View>
      {hasFailed ? <SaveFailedLine /> : null}
      <View className="mt-9 items-center">
        <Tab selected={kind} labels={TAB_LABELS} onSelect={selectKind} />
      </View>
      {/* Figma 5:70 draws no title, so a past day's name sits level with the check, where a title would. */}
      <View pointerEvents="none" className="absolute inset-x-16 top-4 h-12 justify-center">
        <PastDayCaption dayKey={dayKey} />
      </View>
      <View className="absolute right-4 top-4">
        <LiquidGlassIconButton
          tone="light"
          icon={<CheckIcon />}
          accessibilityLabel="Confirm"
          disabled={!canConfirm}
          onPress={confirm}
        />
      </View>
    </View>
  );
};
