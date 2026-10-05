import { useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { scrollOffsets } from '@/modules/theme';

import type { CalendarMonth } from '../types/calendar.types';
import { CalendarMonthSection } from './CalendarMonthSection';

interface CalendarMonthListProps {
  months: readonly CalendarMonth[];
  headerHeight: number;
}

export const CalendarMonthList = ({ months, headerHeight }: CalendarMonthListProps) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const hasOpenedRef = useRef(false);

  const handleCurrentMonthLayout = (event: LayoutChangeEvent) => {
    if (hasOpenedRef.current) return;

    hasOpenedRef.current = true;
    scrollRef.current?.scrollTo({
      y: Math.max(0, event.nativeEvent.layout.y - headerHeight - scrollOffsets['calendar-current-month']),
      animated: false,
    });
  };

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerClassName="gap-6"
      contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: insets.bottom }}
    >
      {months.map((month) => (
        <CalendarMonthSection
          key={month.monthKey}
          month={month}
          onLayout={month.position === 'current' ? handleCurrentMonthLayout : undefined}
        />
      ))}
    </ScrollView>
  );
};
