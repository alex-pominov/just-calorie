import { useDatabase } from '@/modules/database';

import { setCarryOverDecision } from '../repositories/tracking.repository';
import type { CarryOverDecision } from '../types/tracking.types';

export function useSetCarryOverDecision(): (decision: CarryOverDecision) => Promise<void> {
  const database = useDatabase();

  return (decision) => setCarryOverDecision(database, decision);
}
