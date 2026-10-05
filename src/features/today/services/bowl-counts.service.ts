import type { BowlInput, BowlState } from '../types/bowl.types';

/** Balls in a bowl filled to the cap. The bowl fills by the share of the cap used, not one ball per calorie. */
export const FULL_BOWL_BALLS = 100;
/** The most overflow balls drawn however far over the cap, which keeps the simulation and the screen light. */
export const MAX_OVERFLOW_BALLS = 50;
/** The dark decorative balls an empty bowl keeps at its bottom (1:2, node 5:2067). */
export const EMPTY_BOWL_BALLS = 5;

const ballsFor = (kcal: number, capKcal: number) => Math.round((kcal / capKcal) * FULL_BOWL_BALLS);

/** The balls and the track a day's figures draw. */
export function bowlState({ totalKcal, addedCarryOverKcal, capKcal }: BowlInput): BowlState {
  if (totalKcal <= 0) {
    return {
      counts: { placeholder: EMPTY_BOWL_BALLS, 'carry-over': 0, eaten: 0, overflow: 0 },
      isOverCap: false,
      arcFraction: 0,
    };
  }

  const isOverCap = totalKcal > capKcal;
  // Any amount shows at least one ball, and a carry-over never takes more balls than the bowl holds.
  const inside = Math.max(1, ballsFor(Math.min(totalKcal, capKcal), capKcal));
  const carryOver = addedCarryOverKcal > 0 ? Math.min(inside, Math.max(1, ballsFor(addedCarryOverKcal, capKcal))) : 0;
  const overflow = isOverCap ? Math.min(MAX_OVERFLOW_BALLS, Math.max(1, ballsFor(totalKcal - capKcal, capKcal))) : 0;

  return {
    counts: { placeholder: 0, 'carry-over': carryOver, eaten: inside - carryOver, overflow },
    isOverCap,
    arcFraction: isOverCap ? 1 : totalKcal / capKcal,
  };
}
