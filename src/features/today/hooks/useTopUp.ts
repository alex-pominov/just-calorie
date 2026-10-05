import { useState } from 'react';

import type { EntryKind } from '@/features/tracking';
import { MAX_KCAL, useAddEntry, useDaySummary } from '@/features/tracking';
import { playLightImpactHaptic } from '@/modules/haptics';

import type { KcalDraft } from './useKcalDraft';
import { useKcalDraft } from './useKcalDraft';

export interface TopUp extends KcalDraft {
  kind: EntryKind;
  selectKind: (kind: EntryKind) => void;
}

/** An amount added to, or removed from, the day passed in. */
export function useTopUp(dayKey: string, onDone: () => void): TopUp {
  const addEntry = useAddEntry();
  const summary = useDaySummary(dayKey);
  const [kind, setKind] = useState<EntryKind>('add');
  // Lead ruling on f-8aebf1: a removal never takes the day below zero, so Remove takes at most what is eaten.
  const removableKcal = summary === null ? 0 : Math.max(0, summary.entriesTotalKcal);
  const draft = useKcalDraft({
    initialText: '',
    maxKcal: kind === 'remove' ? removableKcal : MAX_KCAL,
    store: async (kcal) => {
      await addEntry({ dayKey, kind, kcal });
      // A stored add taps; a removal does not.
      if (kind === 'add') playLightImpactHaptic();
    },
    onDone,
  });

  return { ...draft, kind, selectKind: setKind };
}
