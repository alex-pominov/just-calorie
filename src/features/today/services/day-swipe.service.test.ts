import { swipedDay } from './day-swipe.service';

describe('swipedDay', () => {
  it.each([
    ['a drag right past the threshold', { translationX: 80, velocityX: 0 }, 'previous'],
    ['a fast flick right', { translationX: 20, velocityX: 900 }, 'previous'],
    ['a drag left past the threshold', { translationX: -80, velocityX: 0 }, 'next'],
    ['a fast flick left', { translationX: -20, velocityX: -900 }, 'next'],
  ] as const)('moves to the %2$s day after %1$s', (_label, swipe, expected) => {
    expect(swipedDay(swipe)).toBe(expected);
  });

  it.each([
    ['a short slow drag', { translationX: 30, velocityX: 100 }],
    ['a drag right flung back left', { translationX: 80, velocityX: -900 }],
    ['no movement', { translationX: 0, velocityX: 0 }],
  ])('stays on the day after %s', (_label, swipe) => {
    expect(swipedDay(swipe)).toBeNull();
  });
});
