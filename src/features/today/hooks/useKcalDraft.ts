import { useRef, useState } from 'react';

import { acceptKcalText, kcalFromText } from '../services/kcal-input.service';

interface KcalDraftOptions {
  initialText: string;
  /** The largest amount this draft may hold; a keystroke past it is refused. */
  maxKcal: number;
  store: (kcal: number) => Promise<void>;
  onDone: () => void;
}

export interface KcalDraft {
  text: string;
  canConfirm: boolean;
  /** The last confirm could not be stored; cleared by the next keystroke or confirm. */
  hasFailed: boolean;
  type: (typed: string) => void;
  confirm: () => void;
}

/** A pop-up's typed amount: stored once on confirm, never before, so a dismissal stores nothing. */
export function useKcalDraft({ initialText, maxKcal, store, onDone }: KcalDraftOptions): KcalDraft {
  const [text, setText] = useState(initialText);
  const [isStoring, setIsStoring] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  // Read before React re-renders: a second tap in the same frame sees the first one's flag.
  const inFlight = useRef(false);
  const kcal = kcalFromText(text);

  return {
    text,
    canConfirm: kcal !== null && kcal <= maxKcal && !isStoring,
    hasFailed,
    type: (typed) => {
      setHasFailed(false);
      setText((current) => acceptKcalText(current, typed, { maxKcal }));
    },
    confirm: () => {
      if (kcal === null || kcal > maxKcal || inFlight.current) return;

      inFlight.current = true;
      setIsStoring(true);
      setHasFailed(false);
      store(kcal).then(onDone, (error: unknown) => {
        console.error('Could not save the amount', error);
        inFlight.current = false;
        setIsStoring(false);
        setHasFailed(true);
      });
    },
  };
}
