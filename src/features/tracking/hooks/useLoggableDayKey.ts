import { useState } from 'react';

import { loggableDayKey } from '../services/day-key.service';
import { useTodayKey } from './useTodayKey';

interface ResolvedDay {
  param: string | null;
  dayKey: string;
}

const paramText = (param: unknown) => (typeof param === 'string' ? param : null);

/** The day a screen opened with a `day` parameter writes to: resolved as it opens, and kept across midnight. */
export function useLoggableDayKey(param: unknown): string {
  const todayKey = useTodayKey();
  const [resolved, setResolved] = useState<ResolvedDay>(() => ({
    param: paramText(param),
    dayKey: loggableDayKey(param, todayKey),
  }));

  if (resolved.param !== paramText(param)) {
    const next = { param: paramText(param), dayKey: loggableDayKey(param, todayKey) };
    setResolved(next);

    return next.dayKey;
  }

  return resolved.dayKey;
}
