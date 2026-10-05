import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { Text, View } from 'react-native';

import type { SeedScenario } from '@/features/tracking';
import { isSeedScenario, SEED_SCENARIOS, useSeedScenario, useTodayKey } from '@/features/tracking';

// justcalorie://dev/seed?scenario=<name> replaces every stored day with one state frame, then opens the main screen.
export default function SeedRoute() {
  const { scenario } = useLocalSearchParams();
  const seed = useSeedScenario();
  const todayKey = useTodayKey();
  const [failure, setFailure] = useState<unknown>(null);
  const requested: SeedScenario | null = typeof scenario === 'string' && isSeedScenario(scenario) ? scenario : null;

  const seedThenOpen = useEffectEvent(async (name: SeedScenario) => {
    await seed({ scenario: name, todayKey });
    router.replace('/');
  });

  useEffect(() => {
    if (requested !== null) {
      seedThenOpen(requested).catch(setFailure);
    }
  }, [requested]);

  if (failure !== null) {
    throw failure;
  }

  return (
    <View className="flex-1 items-center justify-center gap-2 bg-ink-900 px-4">
      <Text className="text-center font-manrope-bold text-body text-primary">
        {requested === null ? `Unknown scenario. Use one of: ${SEED_SCENARIOS.join(', ')}` : `Seeding ${requested}…`}
      </Text>
    </View>
  );
}
