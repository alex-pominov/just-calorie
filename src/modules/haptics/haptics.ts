import * as Haptics from 'expo-haptics';

// Haptics are best-effort: iOS plays nothing in Low Power Mode, with System Haptics off, or without a Taptic Engine,
// and a refusal must never reach the screen that asked, so every failure, thrown or rejected, is dropped here.
const play = (haptic: () => Promise<void>): void => {
  void Promise.resolve()
    .then(haptic)
    .catch(() => undefined);
};

/** The light tick of a selection changing, as when a swipe moves to another day. */
export function playSelectionHaptic(): void {
  play(() => Haptics.selectionAsync());
}

/** A light tap, for an entry stored. */
export function playLightImpactHaptic(): void {
  play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}
