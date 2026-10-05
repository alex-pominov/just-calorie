import { useLocalSearchParams } from 'expo-router';

import { TrackWithAiScreen } from '@/features/track-with-ai';
import { useLoggableDayKey } from '@/features/tracking';

// justcalorie://track?day=YYYY-MM-DD adds to that day; without one, or with a day after today, to today.
export default function TrackWithAiRoute() {
  const { day } = useLocalSearchParams();

  return <TrackWithAiScreen dayKey={useLoggableDayKey(day)} />;
}
