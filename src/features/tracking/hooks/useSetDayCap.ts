import { useDatabase } from '@/modules/database';

import { setDayCap } from '../repositories/tracking.repository';
import type { DayCapChange } from '../types/tracking.types';

export function useSetDayCap(): (change: DayCapChange) => Promise<void> {
  const database = useDatabase();

  return (change) => setDayCap(database, change);
}
