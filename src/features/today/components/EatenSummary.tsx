import { Text, View } from 'react-native';

import { cn } from '@/utils/tailwind';

import { OvercapSelector } from '@/components/form';
import { EditCapFigure, EditCapLabel } from '@/components/primitives';
import type { DayFigures } from '@/features/tracking';

import type { CarryOverOffer } from '../types/today.types';

interface EatenSummaryProps {
  figures: DayFigures;
  carryOver: CarryOverOffer | null;
  /** Names the overage's day for a screen reader: yesterday for today, the previous day for a past day. */
  isToday: boolean;
  onToggleCarryOver: () => void;
  onEditCap: () => void;
}

export const EatenSummary = ({ figures, carryOver, isToday, onToggleCarryOver, onEditCap }: EatenSummaryProps) => (
  <View className="items-center gap-3 self-stretch">
    <View className="items-center self-stretch">
      <Text className="font-manrope-bold text-body text-content-secondary">Eaten</Text>
      {/* Figma's 100px line. The figure is centred in it out of flow: in flow, shrink-to-fit would also fit
          it to the line's height, which is shorter than the font's own, and draw the digits small. */}
      <View className="h-25 justify-center self-stretch">
        <Text
          testID="today-eaten"
          numberOfLines={1}
          adjustsFontSizeToFit
          className={cn(
            'absolute text-center font-manrope-semibold text-display text-primary',
            carryOver === null ? 'inset-x-0' : 'inset-x-20',
          )}
        >
          {figures.eatenKcal}
        </Text>
      </View>
    </View>
    <EditCapLabel onPress={onEditCap}>
      <EditCapFigure>{figures.leftKcal}</EditCapFigure> from {figures.capKcal} kcal left
    </EditCapLabel>
    {carryOver === null ? null : (
      <View className="absolute right-0 top-0">
        <OvercapSelector
          added={carryOver.added}
          label={`+${carryOver.kcal}`}
          accessibilityLabel={`${isToday ? "Yesterday's" : "The previous day's"} overage, ${carryOver.kcal} kcal`}
          onPress={onToggleCarryOver}
        />
      </View>
    )}
  </View>
);
