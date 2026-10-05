import type { BallGroup, BallKind, BowlChange, BowlCounts } from '../types/bowl.types';

function drop(kind: BallKind, count: number): BowlChange[] {
  'worklet';
  return count > 0 ? [{ action: 'drop', kind, count }] : [];
}

function remove(group: BallGroup, count: number): BowlChange[] {
  'worklet';
  return count > 0 ? [{ action: 'remove', group, count }] : [];
}

/**
 * The changes, in order, that turn the balls in the bowl into the balls a day needs. Balls join and leave each
 * group only at its top: overflow leaves first, then the pile. The pile's lowest balls are its carry-over, so the
 * world re-colours the balls that stay, and coral drops only when the pile that stays is too small to hold it
 * (Manager ruling on request [1]). Decorative balls leave before anything drops, and return last.
 */
export function planBowlChanges(present: BowlCounts, target: BowlCounts): BowlChange[] {
  'worklet';
  const presentPile = present['carry-over'] + present.eaten;
  const targetPile = target['carry-over'] + target.eaten;
  const kept = Math.min(presentPile, targetPile);
  const carryOverDropped = Math.max(0, target['carry-over'] - kept);

  return [
    ...remove('placeholder', present.placeholder - target.placeholder),
    ...remove('overflow', present.overflow - target.overflow),
    ...remove('pile', presentPile - targetPile),
    ...drop('carry-over', carryOverDropped),
    ...drop('eaten', targetPile - kept - carryOverDropped),
    ...drop('overflow', target.overflow - present.overflow),
    ...drop('placeholder', target.placeholder - present.placeholder),
  ];
}
