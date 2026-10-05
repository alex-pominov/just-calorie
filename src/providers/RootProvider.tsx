import type { PropsWithChildren } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DatabaseProvider } from '@/modules/database';

// DatabaseProvider renders nothing until migrations finish, so the Stack mounts late and
// expo-router keeps the splash up until then: no screen ever reads a half-migrated database.
export const RootProvider = ({ children }: PropsWithChildren) => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DatabaseProvider>{children}</DatabaseProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);
