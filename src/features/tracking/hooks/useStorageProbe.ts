import type { DaySummary, EntryKind } from '../types/tracking.types';
import { useAddEntry } from './useAddEntry';
import { useDaySummary } from './useDaySummary';
import { useSetCarryOverDecision } from './useSetCarryOverDecision';
import { useSetDailyCap } from './useSetDailyCap';
import { useTodayKey } from './useTodayKey';

// Fixed development values, not product defaults: the cap is Figma's sample figure (5:2197).
export const PROBE_ENTRY_KCAL = 100;
export const PROBE_CAP_KCAL = 1200;

interface StorageProbe {
  todayKey: string;
  summary: DaySummary | null;
  appendEntry: (kind: EntryKind) => Promise<void>;
  setTestCap: () => Promise<void>;
  toggleCarryOver: () => Promise<void>;
}

export function useStorageProbe(): StorageProbe {
  const todayKey = useTodayKey();
  const summary = useDaySummary(todayKey);
  const addEntry = useAddEntry();
  const setDailyCap = useSetDailyCap();
  const setCarryOverDecision = useSetCarryOverDecision();

  return {
    todayKey,
    summary,
    appendEntry: (kind) => addEntry({ dayKey: todayKey, kind, kcal: PROBE_ENTRY_KCAL }),
    setTestCap: () => setDailyCap({ capKcal: PROBE_CAP_KCAL, todayKey }),
    toggleCarryOver: () => setCarryOverDecision({ dayKey: todayKey, added: summary?.carryOverAdded !== true }),
  };
}
