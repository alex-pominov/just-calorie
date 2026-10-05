import { MAX_KCAL } from '@/features/tracking';

import { acceptKcalText, kcalFromText } from './kcal-input.service';

describe('acceptKcalText', () => {
  it.each([
    ['', '2', '2'],
    ['2', '25', '25'],
    ['25', '250', '250'],
    ['250', '25', '25'],
    ['2', '', ''],
    ['1000', '10000', '10000'],
  ])('takes %p typed on to %p as %p', (current, typed, expected) => {
    expect(acceptKcalText(current, typed)).toBe(expected);
  });

  it.each([
    ['1000', '10001'],
    ['10000', '100000'],
    ['9999', '99999'],
  ])('refuses a digit that would take %p past the bound (%p), keeping what was there', (current, typed) => {
    expect(acceptKcalText(current, typed)).toBe(current);
    expect(MAX_KCAL).toBe(10_000);
  });

  it.each([
    ['25', '25.'],
    ['25', '25,'],
    ['25', '-25'],
    ['', ' '],
  ])('refuses anything but digits: %p typed on to %p', (current, typed) => {
    expect(acceptKcalText(current, typed)).toBe(current);
  });

  it.each([
    ['', '0', '0'],
    ['0', '05', '5'],
    ['0', '00', '0'],
  ])('keeps no leading zero: %p typed on to %p becomes %p', (current, typed, expected) => {
    expect(acceptKcalText(current, typed)).toBe(expected);
  });
});

describe('kcalFromText', () => {
  it.each([
    ['', null],
    ['0', null],
    ['1', 1],
    ['250', 250],
    ['10000', 10_000],
  ])('reads %p as %p, with nothing to confirm while empty or 0', (text, expected) => {
    expect(kcalFromText(text)).toBe(expected);
  });
});
