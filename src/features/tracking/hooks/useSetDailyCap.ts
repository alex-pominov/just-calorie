import { useDatabase } from '@/modules/database';

import { setDailyCap } from '../repositories/tracking.repository';
import type { DailyCapChange } from '../types/tracking.types';

export function useSetDailyCap(): (change: DailyCapChange) => Promise<void> {
  const database = useDatabase();

  return (change) => setDailyCap(database, change);
}
