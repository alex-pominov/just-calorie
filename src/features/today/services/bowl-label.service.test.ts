import { bowlLabel } from './bowl-label.service';

describe('bowlLabel', () => {
  it.each([
    [{ eatenKcal: 0, capKcal: 1200, isOverCap: false }, 0, '0 kcal eaten, against a 1200 kcal cap'],
    [{ eatenKcal: 800, capKcal: 1200, isOverCap: false }, 0, '800 kcal eaten, against a 1200 kcal cap'],
    [{ eatenKcal: 1600, capKcal: 1200, isOverCap: true }, 0, '1600 kcal eaten, against a 1200 kcal cap: over the cap'],
    [
      { eatenKcal: 0, capKcal: 1200, isOverCap: false },
      400,
      '0 kcal eaten and 400 kcal carried over, against a 1200 kcal cap',
    ],
  ])('reads %j with %p kcal carried over as “%s”', (figures, addedCarryOverKcal, expected) => {
    expect(bowlLabel({ ...figures, leftKcal: 0 }, addedCarryOverKcal)).toBe(expected);
  });
});
