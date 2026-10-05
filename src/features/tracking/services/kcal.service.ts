// Above any single entry or daily cap a person plausibly types, so only a slipped extra digit
// (or two) on a typical value is refused.
export const MAX_KCAL = 10_000;

// Stored once on a database with no cap. A product value awaiting the owner (main-screen request [3]).
export const DEFAULT_DAILY_CAP_KCAL = 1200;

export class InvalidKcalError extends Error {
  constructor() {
    super(`kcal must be a whole number from 1 to ${MAX_KCAL}`);
    this.name = 'InvalidKcalError';
  }
}

export class RemovalExceedsEatenError extends Error {
  constructor() {
    super('A removal may not take a day’s eaten below 0 kcal');
    this.name = 'RemovalExceedsEatenError';
  }
}

function isValidKcal(kcal: number): boolean {
  return Number.isInteger(kcal) && kcal >= 1 && kcal <= MAX_KCAL;
}

export function assertValidKcal(kcal: number): void {
  if (!isValidKcal(kcal)) {
    throw new InvalidKcalError();
  }
}
