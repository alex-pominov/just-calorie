import { router } from 'expo-router';

/** Leaves a pop-up for the screen under it, or the main screen when a link opened the pop-up first. */
export function closeSheet(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/');
}
