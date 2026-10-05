import { router } from 'expo-router';

import { TodayScreen } from '@/features/today';

export default function MainScreen() {
  return (
    <TodayScreen
      onOpenCalendar={() => router.push('/calendar')}
      onTrackWithAi={(day) => router.push({ pathname: '/track', params: { day } })}
      onOpenTopUp={(day) => router.push({ pathname: '/top-up', params: { day } })}
      onEditCap={(day) => router.push({ pathname: '/edit-cap', params: { day } })}
    />
  );
}
