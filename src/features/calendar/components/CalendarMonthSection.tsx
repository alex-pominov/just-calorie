import type { LayoutChangeEvent } from 'react-native';
import { Text, View } from 'react-native';

import type { CalendarMonthDayCellProps, CalendarWeekRowCell } from '@/components/calendar';
import {
  CalendarMonthBlankCell,
  CalendarMonthDayCell,
  CalendarWeekAverageCell,
  CalendarWeekRow,
} from '@/components/calendar';
import { cn } from '@/utils/tailwind';

import { describeCalendarDay, describeWeekAverage } from '../services/day-label.service';
import { WEEKDAY_COLUMNS } from '../services/month-grid.service';
import type { CalendarDay, CalendarMonth, CalendarWeek, GridWeek } from '../types/calendar.types';

interface CalendarMonthSectionProps {
  month: CalendarMonth;
  onLayout?: ((event: LayoutChangeEvent) => void) | undefined;
}

function toCellProps(day: CalendarDay): CalendarMonthDayCellProps {
  const cell = {
    tone: day.isWeekend ? 'weekend' : 'weekday',
    day: String(day.dayOfMonth),
    accessibilityLabel: describeCalendarDay(day),
    testID: `calendar-day-${day.dayKey}`,
  } as const;

  return day.figureKcal === null
    ? { ...cell, variant: day.state }
    : { ...cell, variant: day.state, figure: String(day.figureKcal) };
}

const weekKey = (week: GridWeek<CalendarDay>) => week.find((day) => day !== null)?.dayKey;

function toRowCells({ days, averageKcal }: CalendarWeek): CalendarWeekRowCell[] {
  const dayCells = WEEKDAY_COLUMNS.map((_, column) => {
    const day = days[column] ?? null;

    return day === null
      ? { key: `blank-${column}`, content: <CalendarMonthBlankCell /> }
      : { key: day.dayKey, content: <CalendarMonthDayCell {...toCellProps(day)} /> };
  });
  const averageCell =
    averageKcal === null ? (
      <CalendarMonthBlankCell />
    ) : (
      <CalendarWeekAverageCell
        figure={String(averageKcal)}
        accessibilityLabel={describeWeekAverage(averageKcal)}
        testID={`calendar-week-average-${weekKey(days)}`}
      />
    );

  return [...dayCells, { key: 'average', content: averageCell }];
}

export const CalendarMonthSection = ({ month, onLayout }: CalendarMonthSectionProps) => (
  <View
    testID={`calendar-month-${month.monthKey}`}
    onLayout={onLayout}
    className={cn(month.position === 'upcoming' && 'opacity-50')}
  >
    <View className="flex-row items-center px-4 py-2">
      <Text accessibilityRole="header" className="font-manrope-semibold text-heading text-primary">
        {month.title}
      </Text>
    </View>
    <View testID={`calendar-grid-${month.monthKey}`} className="gap-2">
      {month.weeks.map((week) => (
        <CalendarWeekRow key={weekKey(week.days)} testID={`calendar-week-${weekKey(week.days)}`} cells={toRowCells(week)} />
      ))}
    </View>
  </View>
);
