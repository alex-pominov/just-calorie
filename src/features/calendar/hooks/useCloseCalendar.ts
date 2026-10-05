import { useRouter } from 'expo-router';

/** Back to whatever opened the calendar; a deep link with no history lands on the main screen instead. */
export function useCloseCalendar(): () => void {
  const router = useRouter();

  return () => {
    if (router.canGoBack()) {
      router.back();

      return;
    }

    router.replace('/');
  };
}
