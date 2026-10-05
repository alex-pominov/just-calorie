import '../global.css';

import { Stack } from 'expo-router';

import { FULL_SCREEN_OPTIONS, ROOT_STACK_SETTINGS, SHEET_OPTIONS } from '@/config/navigation';
import { colors } from '@/modules/theme';
import { RootProvider } from '@/providers/RootProvider';

// On iOS 26 a transparent form sheet takes the system's glass, which is what Figma draws for the pop-ups.
export const unstable_settings = ROOT_STACK_SETTINGS;

export default function RootLayout() {
  return (
    <RootProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors['ink-900'] } }}>
        <Stack.Screen name="calendar" options={FULL_SCREEN_OPTIONS} />
        <Stack.Screen name="track" options={FULL_SCREEN_OPTIONS} />
        <Stack.Screen name="top-up" options={SHEET_OPTIONS} />
        <Stack.Screen name="edit-cap" options={SHEET_OPTIONS} />
      </Stack>
    </RootProvider>
  );
}
