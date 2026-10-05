import { bowlState, EMPTY_BOWL_BALLS, FULL_BOWL_BALLS, MAX_OVERFLOW_BALLS } from './bowl-counts.service';

const CAP = 1200;

const countsFor = (totalKcal: number, addedCarryOverKcal = 0) =>
  bowlState({ totalKcal, addedCarryOverKcal, capKcal: CAP }).counts;

describe('bowlState', () => {
  it('fills a bowl of about 100 balls by the share of the cap eaten, min(total / cap, 1) x 100', () => {
    const eaten = [0, 300, 600, 900, 1200].map((kcal) => countsFor(kcal).eaten);

    expect([FULL_BOWL_BALLS, eaten]).toEqual([100, [0, 25, 50, 75, 100]]);
  });

  it('keeps the bowl at full white over the cap, and shows the overage as overflow at the same scale', () => {
    expect(countsFor(1600)).toEqual({ placeholder: 0, 'carry-over': 0, eaten: 100, overflow: 33 });
  });

  it('caps the overflow at 50 balls however far over the cap', () => {
    const overflow = [1800, 2400, 9000].map((kcal) => countsFor(kcal).overflow);

    expect([MAX_OVERFLOW_BALLS, overflow]).toEqual([50, [50, 50, 50]]);
  });

  it('shows at least one ball for any amount eaten, and one overflow ball for any amount over', () => {
    expect([countsFor(5).eaten, countsFor(CAP + 1).overflow]).toEqual([1, 1]);
  });

  it('draws an empty day as the dark decorative balls and nothing else', () => {
    expect(countsFor(0)).toEqual({ placeholder: EMPTY_BOWL_BALLS, 'carry-over': 0, eaten: 0, overflow: 0 });
    expect(EMPTY_BOWL_BALLS).toBeGreaterThanOrEqual(4);
    expect(EMPTY_BOWL_BALLS).toBeLessThanOrEqual(6);
  });

  it('draws a day at or below zero as empty, even with a carry-over added', () => {
    expect(countsFor(-300, 400)).toEqual(countsFor(0));
  });

  it('counts an added carry-over toward the fill, in its own balls', () => {
    expect(countsFor(1000, 400)).toEqual({ placeholder: 0, 'carry-over': 33, eaten: 50, overflow: 0 });
  });

  it('never gives a carry-over more balls than the bowl holds, and never fewer than one', () => {
    expect([countsFor(100, 400)['carry-over'], countsFor(500, 1)['carry-over']]).toEqual([8, 1]);
  });

  it('runs the white arc by the share of the cap, full and coral over it, and draws none for an empty day', () => {
    const states = [0, 600, 1200, 1300].map((kcal) => bowlState({ totalKcal: kcal, addedCarryOverKcal: 0, capKcal: CAP }));

    expect(states.map(({ arcFraction, isOverCap }) => [arcFraction, isOverCap])).toEqual([
      [0, false],
      [0.5, false],
      [1, false],
      [1, true],
    ]);
  });
});
