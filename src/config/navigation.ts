// The root stack's settings, read by app/_layout.tsx. They live here so tests can use the same objects:
// a route file cannot be imported under jest (app/_layout.tsx imports global.css).

/** A link that opens a pop-up first (justcalorie://top-up) still puts the main screen under it. */
export const ROOT_STACK_SETTINGS = { anchor: 'index' } as const;

/** The pop-ups: native form sheets sized to their content, dismissed by a swipe down. */
export const SHEET_OPTIONS = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: 'fitToContents',
  contentStyle: { backgroundColor: 'transparent' },
} as const;
