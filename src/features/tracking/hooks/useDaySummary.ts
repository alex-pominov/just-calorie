import { useEffect, useState } from 'react';

import { useDatabase } from '@/modules/database';

import { getDaySummary } from '../repositories/tracking.repository';
import type { DaySummary } from '../types/tracking.types';

interface ReadFailure {
  error: unknown;
}

export function useDaySummary(dayKey: string): DaySummary | null {
  const database = useDatabase();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [failure, setFailure] = useState<ReadFailure | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const refresh = () => {
      getDaySummary(database, dayKey).then(
        (next) => {
          if (isCurrent) setSummary(next);
        },
        (error: unknown) => {
          if (isCurrent) setFailure({ error });
        },
      );
    };

    refresh();
    const unsubscribe = database.subscribe(refresh);

    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [database, dayKey]);

  if (failure !== null) {
    throw failure.error;
  }

  return summary?.dayKey === dayKey ? summary : null;
}
