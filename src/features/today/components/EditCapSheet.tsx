import { Text, TextInput, View } from 'react-native';

import { CheckIcon } from '@/assets/icons';
import { LiquidGlassIconButton } from '@/components/primitives';
import { colors } from '@/modules/theme';

import { useDayCap } from '../hooks/useDayCap';
import { useEditCap } from '../hooks/useEditCap';
import { PastDayCaption } from './PastDayCaption';
import { SaveFailedLine } from './SaveFailedLine';

interface EditCapSheetProps {
  /** The day whose cap is edited; today's is also the daily cap. */
  dayKey: string;
  onDone: () => void;
}

interface EditCapFormProps extends EditCapSheetProps {
  initialCapKcal: number;
}

// Mounted once the cap is read, so the draft starts from it rather than from an empty field.
const EditCapForm = ({ dayKey, initialCapKcal, onDone }: EditCapFormProps) => {
  const { text, canConfirm, hasFailed, type, confirm } = useEditCap({ dayKey, initialCapKcal, onDone });

  return (
    <View className="px-4 pb-10 pt-7">
      <Text className="text-center font-manrope-bold text-subtitle text-primary">Daily Cap</Text>
      <PastDayCaption dayKey={dayKey} />
      <View className="mt-9 h-20 items-center justify-center">
        <TextInput
          testID="edit-cap-amount"
          accessibilityLabel="Daily cap in kcal"
          value={text}
          onChangeText={type}
          placeholder="0"
          placeholderTextColor={colors['content-disabled']}
          selectionColor={colors.primary}
          keyboardType="number-pad"
          autoFocus
          className="font-manrope-semibold text-amount text-primary"
        />
      </View>
      {hasFailed ? <SaveFailedLine /> : null}
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

// Figma 8:3092.
export const EditCapSheet = ({ dayKey, onDone }: EditCapSheetProps) => {
  const capKcal = useDayCap(dayKey);

  return capKcal === null ? null : <EditCapForm dayKey={dayKey} initialCapKcal={capKcal} onDone={onDone} />;
};
