import { Text } from 'react-native';

import { dateName, useTodayKey } from '@/features/tracking';

interface PastDayCaptionProps {
  dayKey: string;
}

// Manager ruling on qa f-fbf806: a pop-up opened from a past day names it; opened from today it stays as Figma draws it.
export const PastDayCaption = ({ dayKey }: PastDayCaptionProps) => {
  const todayKey = useTodayKey();

  return dayKey === todayKey ? null : (
    <Text testID="past-day-caption" className="text-center font-manrope-semibold text-caption text-content-muted">
      {dateName(dayKey)}
    </Text>
  );
};
