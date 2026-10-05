import { useState } from 'react';
import { View } from 'react-native';

import { useCalendarMonths } from '../hooks/useCalendarMonths';
import { useCloseCalendar } from '../hooks/useCloseCalendar';
import { CalendarHeader } from './CalendarHeader';
import { CalendarMonthList } from './CalendarMonthList';

/** The header is first in the tree and stays painted above the months by its z-index; they wait for its height. */
export const CalendarScreen = () => {
  const months = useCalendarMonths();
  const close = useCloseCalendar();
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);

  return (
    <View className="flex-1 bg-ink-900">
      <CalendarHeader onClose={close} onHeightChange={setHeaderHeight} />
      {months === null || headerHeight === null ? null : <CalendarMonthList months={months} headerHeight={headerHeight} />}
    </View>
  );
};
