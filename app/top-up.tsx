import { useLocalSearchParams } from 'expo-router';

import { TopUpSheet } from '@/features/today';
import { useLoggableDayKey } from '@/features/tracking';
import { closeSheet } from '@/utils/close-sheet';

// justcalorie://top-up?day=YYYY-MM-DD writes to that day; without one, or with a day after today, to today.
export default function TopUpRoute() {
  const { day } = useLocalSearchParams();

  return <TopUpSheet dayKey={useLoggableDayKey(day)} onDone={closeSheet} />;
}
