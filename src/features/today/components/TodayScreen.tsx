import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/primitives';

import { useToday } from '../hooks/useToday';
import { swipedDay } from '../services/day-swipe.service';
import { Bowl } from './Bowl';
import { EatenSummary } from './EatenSummary';
import { QuickAddButtons } from './QuickAddButtons';
import { TrackWithAiButton } from './TrackWithAiButton';
import { WeekStrip } from './WeekStrip';

interface TodayScreenProps {
  onOpenCalendar: () => void;
  /** Each opens on the day the screen shows, and writes to it. */
  onTrackWithAi: (dayKey: string) => void;
  onOpenTopUp: (dayKey: string) => void;
  onEditCap: (dayKey: string) => void;
}

// A horizontal drag only: a vertical one, or a tap on a button, never changes the day.
const SWIPE_START_PX = 15;

// Spacing follows Figma 5:1744. The bowl's SVG rises 8px above its 152px frame, so 48 + 8 makes the 56px gap.
export const TodayScreen = ({ onOpenCalendar, onTrackWithAi, onOpenTopUp, onEditCap }: TodayScreenProps) => {
  const { dayKey, monthName, weekDays, view, addKcal, toggleCarryOver, selectDay, showPreviousDay, showNextDay } =
    useToday();
  const insets = useSafeAreaInsets();
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-SWIPE_START_PX, SWIPE_START_PX])
    .failOffsetY([-SWIPE_START_PX, SWIPE_START_PX])
    .onEnd((event, success) => {
      const swiped = success ? swipedDay(event) : null;

      if (swiped === 'previous') showPreviousDay();
      if (swiped === 'next') showNextDay();
    })
    .withTestId('today-day-swipe');

  return (
    <View className="flex-1 bg-ink-900" style={{ paddingTop: insets.top }}>
      <View className="items-center gap-4 px-4">
        <Logo accessibilityLabel="Just Calorie" />
        <WeekStrip days={weekDays} monthName={monthName} onSelectDay={selectDay} onOpenCalendar={onOpenCalendar} />
      </View>
      <GestureDetector gesture={swipe}>
        <View className="flex-1 pt-6">
          {view === null ? null : (
            <View className="items-center px-4">
              <EatenSummary
                figures={view.figures}
                carryOver={view.carryOver}
                isToday={view.isToday}
                onToggleCarryOver={toggleCarryOver}
                onEditCap={() => onEditCap(view.dayKey)}
              />
              <View className="mt-12">
                <Bowl key={view.dayKey} state={view.bowl} accessibilityLabel={view.bowlLabel} />
              </View>
              <View className="mt-14 self-stretch">
                <QuickAddButtons onAdd={addKcal} onOther={() => onOpenTopUp(view.dayKey)} />
              </View>
            </View>
          )}
          <View className="mt-11">
            <TrackWithAiButton onPress={() => onTrackWithAi(dayKey)} />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
};
