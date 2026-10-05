import { MAX_KCAL } from '@/features/tracking';

const DIGITS = /^\d*$/;
const LEADING_ZEROS = /^0+(?=\d)/;

interface KcalBound {
  maxKcal?: number | undefined;
}

/** The text an amount field keeps after a keystroke: digits only, and never a value past its maximum. */
export function acceptKcalText(current: string, typed: string, { maxKcal = MAX_KCAL }: KcalBound = {}): string {
  if (!DIGITS.test(typed)) {
    return current;
  }

  const text = typed.replace(LEADING_ZEROS, '');

  return Number(text) > maxKcal ? current : text;
}

/** The amount to store, or null while there is nothing to confirm (empty, or 0). */
export function kcalFromText(text: string): number | null {
  const kcal = Number(text);

  return text === '' || kcal === 0 ? null : kcal;
}
