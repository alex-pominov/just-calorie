import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CalendarIcon } from '@/assets/icons';
import { CalendarDayCell } from '@/components/calendar';

import type { WeekStripDay } from '../types/week-strip.types';

interface WeekStripProps {
  days: readonly WeekStripDay[] | null;
  monthName: string;
  onSelectDay: (dayKey: string) => void;
  onOpenCalendar: () => void;
}

interface Span {
  x: number;
  width: number;
}

// Figma 5:2556: the last fortnight scrolls inside the left panel, opening on today and tomorrow at its end. The
// selected day is kept centred where the strip can scroll that far; today, next to its end, rests at the end.
export const WeekStrip = ({ days, monthName, onSelectDay, onOpenCalendar }: WeekStripProps) => {
  const scroll = useRef<ScrollView>(null);
  const [cells] = useState(() => new Map<string, Span>());
  const viewportWidth = useRef(0);
  const contentWidth = useRef(0);
  const selectedDayKey = days?.find((day) => day.selected)?.dayKey ?? null;

  const centreOn = (dayKey: string | null, animated: boolean) => {
    const cell = dayKey === null ? undefined : cells.get(dayKey);

    if (cell === undefined || viewportWidth.current === 0) return;

    const furthest = Math.max(0, contentWidth.current - viewportWidth.current);
    const x = Math.min(furthest, Math.max(0, cell.x + cell.width / 2 - viewportWidth.current / 2));
    scroll.current?.scrollTo({ x, animated });
  };

  const glideToSelected = useEffectEvent(() => centreOn(selectedDayKey, true));

  useEffect(() => {
    glideToSelected();
  }, [selectedDayKey]);

  return (
    <View className="flex-row items-stretch gap-1.5 self-stretch">
      <View testID="today-week-strip" className="flex-1 overflow-hidden rounded-l-xl rounded-r-sm bg-white-50">
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1 px-1 py-2"
          onLayout={(event) => {
            viewportWidth.current = event.nativeEvent.layout.width;
            centreOn(selectedDayKey, false);
          }}
          onContentSizeChange={(width) => {
            contentWidth.current = width;
            centreOn(selectedDayKey, false);
          }}
        >
          {days?.map((day) => (
            <View
              key={day.dayKey}
              onLayout={(event) => {
                cells.set(day.dayKey, event.nativeEvent.layout);
                if (day.selected) centreOn(day.dayKey, false);
              }}
            >
              <CalendarDayCell
                variant={day.variant}
                selected={day.selected}
                weekday={day.weekday}
                day={day.day}
                accessibilityLabel={day.accessibilityLabel}
                onPress={() => onSelectDay(day.dayKey)}
              />
            </View>
          ))}
        </ScrollView>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open calendar"
        onPress={onOpenCalendar}
        className="w-10 items-center justify-center gap-1 rounded-l-sm rounded-r-xl bg-white-50 p-1"
      >
        <CalendarIcon />
        <Text className="self-stretch text-center font-manrope-semibold text-caption text-content-soft">{monthName}</Text>
      </Pressable>
    </View>
  );
};
