import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon } from '@/assets/icons';
import { CalendarWeekRow } from '@/components/calendar';
import { LiquidGlassIconButton } from '@/components/primitives';
import { cn } from '@/utils/tailwind';

import { WEEKDAY_COLUMNS } from '../services/month-grid.service';
import { CalendarHeaderBackdrop } from './CalendarHeaderBackdrop';

interface CalendarHeaderProps {
  onClose: () => void;
  onHeightChange: (height: number) => void;
}

/** Sits over the months, from the screen's top edge, so it pads itself below the status bar. */
export const CalendarHeader = ({ onClose, onHeightChange }: CalendarHeaderProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="calendar-header"
      className="absolute left-0 right-0 top-0 z-10"
      style={{ paddingTop: insets.top }}
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
    >
      <CalendarHeaderBackdrop />
      <View className="flex-row items-center gap-2 px-4">
        <View className="h-12 w-12" />
        <Text accessibilityRole="header" className="flex-1 text-center font-manrope-bold text-title text-primary">
          Calendar
        </Text>
        <LiquidGlassIconButton icon={<CloseIcon />} accessibilityLabel="Close" onPress={onClose} />
      </View>
      <View testID="calendar-weekdays" accessibilityElementsHidden className="py-2">
        <CalendarWeekRow
          testID="calendar-weekday-row"
          cells={WEEKDAY_COLUMNS.map((column) => ({
            key: column.label,
            content: (
              <Text
                className={cn(
                  'text-center font-manrope-medium text-label',
                  column.isWeekend ? 'text-content-muted' : 'text-primary',
                )}
              >
                {column.label}
              </Text>
            ),
          }))}
        />
      </View>
    </View>
  );
};
