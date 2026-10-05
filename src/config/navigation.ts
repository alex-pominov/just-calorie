// The root stack's settings, read by app/_layout.tsx. src/config/navigation.test.tsx renders that layout and reads
// how the native stack presents each route.

/** A link that opens a pop-up first (justcalorie://top-up) still puts the main screen under it. */
export const ROOT_STACK_SETTINGS = { anchor: 'index' } as const;

/**
 * Calendar and Track with AI: full-screen pages that slide up from the bottom and slide back down when closed (owner's
 * intake-8). iOS's full-screen presentation has no swipe to dismiss; each page's close control dismisses it.
 */
export const FULL_SCREEN_OPTIONS = { presentation: 'fullScreenModal' } as const;

/** The pop-ups: native form sheets sized to their content, dismissed by a swipe down. */
export const SHEET_OPTIONS = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: 'fitToContents',
  contentStyle: { backgroundColor: 'transparent' },
} as const;
