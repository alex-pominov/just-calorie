import { useEffect, useState } from 'react';

import type { Database } from '@/modules/database';
import { useDatabase } from '@/modules/database';

import { ensureDailyCap } from '../repositories/tracking.repository';

interface StepFailure {
  error: unknown;
}

// Once per database handle, which is once per app load; a failed step is forgotten so a remount retries it.
const ensured = new WeakMap<Database, Promise<void>>();

function ensureOnce(database: Database): Promise<void> {
  const running = ensured.get(database) ?? ensureDailyCap(database);
  ensured.set(database, running);
  running.catch(() => ensured.delete(database));

  return running;
}

/** True once a daily cap is stored; stores the default on first launch. */
export function useEnsureDailyCap(): boolean {
  const database = useDatabase();
  const [isReady, setIsReady] = useState(false);
  const [failure, setFailure] = useState<StepFailure | null>(null);

  useEffect(() => {
    let isCurrent = true;

    ensureOnce(database).then(
      () => {
        if (isCurrent) setIsReady(true);
      },
      (error: unknown) => {
        if (isCurrent) setFailure({ error });
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [database]);

  if (failure !== null) {
    throw failure.error;
  }

  return isReady;
}
