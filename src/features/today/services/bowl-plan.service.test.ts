import type { BowlCounts } from '../types/bowl.types';
import { planBowlChanges } from './bowl-plan.service';

const counts = (partial: Partial<BowlCounts>): BowlCounts => ({
  placeholder: 0,
  'carry-over': 0,
  eaten: 0,
  overflow: 0,
  ...partial,
});

describe('planBowlChanges', () => {
  it('drops only the balls a rise needs, leaving the pile where it is', () => {
    expect(planBowlChanges(counts({ eaten: 33 }), counts({ eaten: 67 }))).toEqual([
      { action: 'drop', kind: 'eaten', count: 34 },
    ]);
  });

  it('removes the overflow before any ball of the pile, then the pile from its top', () => {
    expect(planBowlChanges(counts({ eaten: 100, overflow: 33 }), counts({ eaten: 67 }))).toEqual([
      { action: 'remove', group: 'overflow', count: 33 },
      { action: 'remove', group: 'pile', count: 33 },
    ]);
  });

  it('fills the bowl before it overflows', () => {
    expect(planBowlChanges(counts({ eaten: 67 }), counts({ eaten: 100, overflow: 33 }))).toEqual([
      { action: 'drop', kind: 'eaten', count: 33 },
      { action: 'drop', kind: 'overflow', count: 33 },
    ]);
  });

  it('empties the bowl from the top and only then brings back the decorative balls', () => {
    expect(planBowlChanges(counts({ 'carry-over': 8, eaten: 59 }), counts({ placeholder: 5 }))).toEqual([
      { action: 'remove', group: 'pile', count: 67 },
      { action: 'drop', kind: 'placeholder', count: 5 },
    ]);
  });

  it('clears the decorative balls before the first ball of a day drops', () => {
    expect(planBowlChanges(counts({ placeholder: 5 }), counts({ eaten: 33 }))).toEqual([
      { action: 'remove', group: 'placeholder', count: 5 },
      { action: 'drop', kind: 'eaten', count: 33 },
    ]);
  });

  it('drops a carry-over first into an empty bowl, so it settles at the bottom', () => {
    expect(planBowlChanges(counts({ placeholder: 5 }), counts({ 'carry-over': 33, eaten: 50 }))).toEqual([
      { action: 'remove', group: 'placeholder', count: 5 },
      { action: 'drop', kind: 'carry-over', count: 33 },
      { action: 'drop', kind: 'eaten', count: 50 },
    ]);
  });

  it('adds a carry-over to a pile by dropping on top only, the pile below turning coral rather than re-pouring', () => {
    expect(planBowlChanges(counts({ eaten: 50 }), counts({ 'carry-over': 33, eaten: 50 }))).toEqual([
      { action: 'drop', kind: 'eaten', count: 33 },
    ]);
  });

  it('withdraws a carry-over by removing its count from the top only', () => {
    expect(planBowlChanges(counts({ 'carry-over': 33, eaten: 50 }), counts({ eaten: 50 }))).toEqual([
      { action: 'remove', group: 'pile', count: 33 },
    ]);
  });

  it('drops coral only for the carry-over the pile that stays cannot hold', () => {
    expect(planBowlChanges(counts({ eaten: 10 }), counts({ 'carry-over': 33, eaten: 50 }))).toEqual([
      { action: 'drop', kind: 'carry-over', count: 23 },
      { action: 'drop', kind: 'eaten', count: 50 },
    ]);
  });

  it('changes nothing when the bowl already holds what the day needs', () => {
    expect(planBowlChanges(counts({ eaten: 100, overflow: 50 }), counts({ eaten: 100, overflow: 50 }))).toEqual([]);
  });
});
