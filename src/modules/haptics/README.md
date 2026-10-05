# `modules/haptics`

The app's two haptics, through `expo-haptics`: `playSelectionHaptic()` when a swipe changes the main screen's day, and
`playLightImpactHaptic()` when an entry has been stored. Features call these, never `expo-haptics`, so a test can mock
the package once and assert the calls.

## External constraints

- iOS plays nothing in Low Power Mode, with System Haptics turned off in Settings, while the camera or dictation is
  active, or on a device without a Taptic Engine (expo-haptics, SDK 57 docs). The app has no setting of its own; the
  iOS one governs.
- Haptics are best-effort. A call never throws or rejects into the caller: a failure is dropped here.
- `expo-haptics` is a native module, so a build made before it was added plays nothing (the call is dropped).
