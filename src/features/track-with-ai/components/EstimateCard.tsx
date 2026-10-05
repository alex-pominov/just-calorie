import { Pressable, Text, View } from 'react-native';

import { cn } from '@/utils/tailwind';

import { estimateFigure } from '../services/chat-copy.service';
import type { AddState } from '../types/track-chat.types';

/** The Add control of an estimate that may be added; null draws the figure alone. */
export interface EstimateCardAdd {
  state: AddState;
  onAdd: () => void;
}

interface EstimateCardProps {
  kcal: number;
  /** The day Add writes to, as the chat names it. */
  dayName: string;
  add: EstimateCardAdd | null;
}

/**
 * Frame 9:3385: the figure and the white Add pill. The figure keeps the font's own ~55pt line, so the card's
 * 8pt vertical padding stands in for Figma's 16 around a 40pt line; in a 40pt box iOS would clip the digits.
 * 'Added' is undrawn: the pill dims and stops answering, so one estimate cannot be added twice.
 */
export const EstimateCard = ({ kcal, dayName, add }: EstimateCardProps) => {
  const isAdded = add?.state === 'added';
  const isDisabled = isAdded || add?.state === 'adding';

  return (
    <View className="flex-row items-center gap-3 self-start rounded-xl bg-surface-selected px-4 py-2">
      <Text className="font-manrope-semibold text-estimate text-primary">{estimateFigure(kcal)}</Text>
      {add === null ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${isAdded ? 'Added' : 'Add'} ${kcal} kcal to ${dayName}`}
          accessibilityState={{ disabled: isDisabled }}
          disabled={isDisabled}
          onPress={add.onAdd}
          className={cn('rounded-full px-4 py-2', isAdded ? 'bg-white-100' : 'bg-primary')}
        >
          <Text className={cn('font-manrope-bold text-body-tight', isAdded ? 'text-content-secondary' : 'text-ink-900')}>
            {isAdded ? 'Added' : 'Add'}
          </Text>
        </Pressable>
      )}
    </View>
  );
};
