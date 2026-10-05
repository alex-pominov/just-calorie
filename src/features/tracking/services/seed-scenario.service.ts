import type { Database } from '@/modules/database';

import {
  addEntry,
  resetTrackingData,
  setCarryOverDecision,
  setDailyCap,
} from '../repositories/tracking.repository';
import { shiftDayKey } from './day-key.service';

export const SEED_SCENARIOS = [
  'empty',
  'filled',
  'over',
  'carry-added',
  'carry-withheld',
  'carry-added-over',
  'over-chain',
] as const;

export type SeedScenario = (typeof SEED_SCENARIOS)[number];

export interface SeedRequest {
  scenario: SeedScenario;
  todayKey: string;
}

/** A day before today, stored as a single addition; `addsCarryOver` records the decision on the overage it was offered. */
interface PastDay {
  offset: number;
  kcal: number;
  addsCarryOver?: true;
}

interface ScenarioPlan {
  /** Oldest first: a day's carry-over is computed from the previous day when it is written. */
  pastDays: readonly PastDay[];
  carryOverAdded: boolean | null;
  /** Today's entries, stored as a single addition. */
  todayKcal: number;
}

// The cap every state frame is drawn against; deliberately not the default cap, which the owner may change.
const FRAME_CAP_KCAL = 1200;

// Days before yesterday, as the frames' week strip draws them: three on track, then one left unfilled.
const HISTORY: readonly PastDay[] = [
  { offset: -5, kcal: 1100 },
  { offset: -4, kcal: 950 },
  { offset: -3, kcal: 1150 },
];

const withYesterday = (kcal: number): readonly PastDay[] => [...HISTORY, { offset: -1, kcal }];

// Four days over the cap, each adding the overage carried into it: 400, 500, 300 and 100 carry forward to today, so
// editing the first day moves every later carry-over.
const OVER_CHAIN: readonly PastDay[] = [
  { offset: -4, kcal: 1600 },
  { offset: -3, kcal: 1300, addsCarryOver: true },
  { offset: -2, kcal: 1000, addsCarryOver: true },
  { offset: -1, kcal: 1000, addsCarryOver: true },
];

const PLANS = {
  empty: { pastDays: withYesterday(1000), carryOverAdded: null, todayKcal: 0 },
  filled: { pastDays: withYesterday(1000), carryOverAdded: null, todayKcal: 800 },
  over: { pastDays: withYesterday(1000), carryOverAdded: null, todayKcal: 1600 },
  'carry-added': { pastDays: withYesterday(1600), carryOverAdded: true, todayKcal: 0 },
  'carry-withheld': { pastDays: withYesterday(1600), carryOverAdded: false, todayKcal: 0 },
  'carry-added-over': { pastDays: withYesterday(1600), carryOverAdded: true, todayKcal: 1200 },
  'over-chain': { pastDays: OVER_CHAIN, carryOverAdded: true, todayKcal: 0 },
} satisfies Record<SeedScenario, ScenarioPlan>;

export function isSeedScenario(value: string): value is SeedScenario {
  return SEED_SCENARIOS.some((scenario) => scenario === value);
}

/** Development only: replaces every stored day with the named state frame's data, relative to today. */
export async function seedScenario(database: Database, { scenario, todayKey }: SeedRequest): Promise<void> {
  const plan: ScenarioPlan = PLANS[scenario];

  await resetTrackingData(database);
  await setDailyCap(database, { capKcal: FRAME_CAP_KCAL, todayKey });

  for (const { offset, kcal, addsCarryOver } of plan.pastDays) {
    const dayKey = shiftDayKey(todayKey, offset);

    await addEntry(database, { dayKey, kind: 'add', kcal });
    if (addsCarryOver) {
      await setCarryOverDecision(database, { dayKey, added: true });
    }
  }

  if (plan.carryOverAdded !== null) {
    await setCarryOverDecision(database, { dayKey: todayKey, added: plan.carryOverAdded });
  }

  if (plan.todayKcal > 0) {
    await addEntry(database, { dayKey: todayKey, kind: 'add', kcal: plan.todayKcal });
  }
}
