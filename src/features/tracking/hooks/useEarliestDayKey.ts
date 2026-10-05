import { useEffect, useState } from 'react';

import { useDatabase } from '@/modules/database';

import { findEarliestDayKey } from '../repositories/earliest-day.repository';

export interface EarliestDayRead {
  earliestDayKey: string | null;
}

interface ReadFailure {
  error: unknown;
}

/** Re-reads after every committed write; null until the first read lands. */
export function useEarliestDayKey(): EarliestDayRead | null {
  const database = useDatabase();
  const [read, setRead] = useState<EarliestDayRead | null>(null);
  const [failure, setFailure] = useState<ReadFailure | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const refresh = () => {
      findEarliestDayKey(database).then(
        (earliestDayKey) => {
          if (isCurrent) setRead({ earliestDayKey });
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
  }, [database]);

  if (failure !== null) {
    throw failure.error;
  }

  return read;
}
