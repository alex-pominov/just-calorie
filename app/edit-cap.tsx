import { useLocalSearchParams } from 'expo-router';

import { EditCapSheet } from '@/features/today';
import { useLoggableDayKey } from '@/features/tracking';
import { closeSheet } from '@/utils/close-sheet';

// justcalorie://edit-cap?day=YYYY-MM-DD edits that day's cap; without one, or with a day after today, today's.
export default function EditCapRoute() {
  const { day } = useLocalSearchParams();

  return <EditCapSheet dayKey={useLoggableDayKey(day)} onDone={closeSheet} />;
}
