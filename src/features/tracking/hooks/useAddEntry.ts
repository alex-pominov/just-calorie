import { useDatabase } from '@/modules/database';

import { addEntry } from '../repositories/tracking.repository';
import type { NewEntry } from '../types/tracking.types';

export function useAddEntry(): (entry: NewEntry) => Promise<void> {
  const database = useDatabase();

  return (entry) => addEntry(database, entry);
}
