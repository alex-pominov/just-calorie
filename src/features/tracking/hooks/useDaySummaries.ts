import { useEffect, useState } from 'react';

import { useDatabase } from '@/modules/database';

import { getDaySummaries } from '../repositories/day-summaries.repository';
import type { DayLog, DayRange } from '../types/day-log.types';

interface ReadRange extends DayRange {
  days: DayLog[];
}

interface ReadFailure {
  error: unknown;
}

export function useDaySummaries(range: DayRange): readonly DayLog[] | null {
  const database = useDatabase();
  const { firstDayKey, lastDayKey } = range;
  const [read, setRead] = useState<ReadRange | null>(null);
  const [failure, setFailure] = useState<ReadFailure | null>(null);

  useEffect(() => {
    let isCurrent = true;

    const refresh = () => {
      getDaySummaries(database, { firstDayKey, lastDayKey }).then(
        (days) => {
          if (isCurrent) setRead({ firstDayKey, lastDayKey, days });
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
  }, [database, firstDayKey, lastDayKey]);

  if (failure !== null) {
    throw failure.error;
  }

  return read?.firstDayKey === firstDayKey && read.lastDayKey === lastDayKey ? read.days : null;
}
