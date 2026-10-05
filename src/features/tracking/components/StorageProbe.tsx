import { useState } from 'react';
import { Text, View } from 'react-native';

import { OvercapSelector, Tab } from '@/components/form';
import { EditCapFigure, EditCapLabel } from '@/components/primitives';

import type { EntryKind } from '../types/tracking.types';
import { PROBE_CAP_KCAL, PROBE_ENTRY_KCAL, useStorageProbe } from '../hooks/useStorageProbe';

const TAB_LABELS = { add: 'Add', remove: 'Remove' };
const LINE = 'font-manrope-medium text-body text-content-secondary';

const describeDecision = (added: boolean | null) => (added === null ? 'undecided' : added ? 'added' : 'not added');

// Every figure shown is read back from SQLite through useDaySummary; only the tab highlight is local.
export const StorageProbe = () => {
  const { todayKey, summary, appendEntry, setTestCap, toggleCarryOver } = useStorageProbe();
  const [lastKind, setLastKind] = useState<EntryKind>('add');

  const handleSelect = (kind: EntryKind) => {
    setLastKind(kind);
    void appendEntry(kind);
  };

  if (summary === null) {
    return <Text className={LINE}>Reading {todayKey}…</Text>;
  }

  return (
    <View className="items-start gap-2">
      <Text className={LINE}>Day {summary.dayKey}</Text>
      <Text className={LINE}>Entries total: {summary.entriesTotalKcal} kcal</Text>
      <Text className={LINE}>
        Cap snapshot: {summary.capKcal ?? 'none'} · current cap: {summary.currentCapKcal ?? 'unset'}
      </Text>
      <Text className={LINE}>
        Carry-over: {summary.carryOverKcal} kcal · {describeDecision(summary.carryOverAdded)}
      </Text>
      <Text className={LINE}>Day total: {summary.totalKcal} kcal</Text>
      <Text className={LINE}>Each tab press stores {PROBE_ENTRY_KCAL} kcal</Text>
      <Tab selected={lastKind} labels={TAB_LABELS} onSelect={handleSelect} />
      <EditCapLabel onPress={() => void setTestCap()}>
        Set cap to <EditCapFigure>{PROBE_CAP_KCAL}</EditCapFigure>
      </EditCapLabel>
      <OvercapSelector
        added={summary.carryOverAdded === true}
        label={`+${summary.carryOverKcal}`}
        onPress={() => void toggleCarryOver()}
      />
    </View>
  );
};
