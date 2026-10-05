import { useState } from 'react';

/** The latest value read, held while the next is pending; `value` must keep its identity until the read changes. */
export function useLastRead<T>(value: T | null): T | null {
  const [held, setHeld] = useState<T | null>(value);

  if (value !== null && value !== held) {
    setHeld(value);
  }

  return value ?? held;
}
