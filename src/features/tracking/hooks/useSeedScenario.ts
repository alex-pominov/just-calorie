import { useDatabase } from '@/modules/database';

import type { SeedRequest } from '../services/seed-scenario.service';
import { seedScenario } from '../services/seed-scenario.service';

export function useSeedScenario(): (request: SeedRequest) => Promise<void> {
  const database = useDatabase();

  return (request) => seedScenario(database, request);
}
