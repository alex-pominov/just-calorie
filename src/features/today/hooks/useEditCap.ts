import { MAX_KCAL, useSetDailyCap, useSetDayCap, useTodayKey } from '@/features/tracking';

import type { KcalDraft } from './useKcalDraft';
import { useKcalDraft } from './useKcalDraft';

interface EditCapOptions {
  dayKey: string;
  initialCapKcal: number;
  onDone: () => void;
}

/** Today's cap is also the daily cap every later day takes; a past day's cap changes that day alone. */
export function useEditCap({ dayKey, initialCapKcal, onDone }: EditCapOptions): KcalDraft {
  const todayKey = useTodayKey();
  const setDailyCap = useSetDailyCap();
  const setDayCap = useSetDayCap();

  return useKcalDraft({
    initialText: String(initialCapKcal),
    maxKcal: MAX_KCAL,
    store: (capKcal) => (dayKey === todayKey ? setDailyCap({ capKcal, todayKey }) : setDayCap({ dayKey, capKcal })),
    onDone,
  });
}
