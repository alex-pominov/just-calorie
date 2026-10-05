// @ts-check
// The ONLY place a design value is written. tailwind.config.js, app.config.js and this
// module's index.ts read it; no-second-source.test.ts fails on a colour literal or an
// arbitrary class anywhere else in src/ and app/. CommonJS, so the configs can require it.

const WHITE = '#FFFFFF';
const CORAL = '#FF5E61';
const LIME = '#DBFF66';

/**
 * @param {string} hex `#RRGGBB`
 * @param {number} alpha 0..1
 */
const withAlpha = (hex, alpha) => {
  /** @param {number} at */
  const channel = (at) => parseInt(hex.slice(at, at + 2), 16);

  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${alpha})`;
};

const colors = {
  coral: CORAL,
  lime: LIME,
  primary: WHITE,
  'ink-950': '#08080A',
  'ink-900': '#111113',
  'white-50': withAlpha(WHITE, 0.08),
  'white-100': withAlpha(WHITE, 0.12),
  'content-secondary': withAlpha(WHITE, 0.8),
  'content-soft': withAlpha(WHITE, 0.56),
  'content-muted': withAlpha(WHITE, 0.5),
  'content-tertiary': withAlpha(WHITE, 0.4),
  'content-faint': withAlpha(WHITE, 0.32),
  'content-disabled': withAlpha(WHITE, 0.2),
  'surface-selected': withAlpha(WHITE, 0.16),
  'surface-disabled': withAlpha(WHITE, 0.06),
  'surface-light': withAlpha(WHITE, 0.9),
  'over-surface': withAlpha(CORAL, 0.24),
  'over-surface-subtle': withAlpha(CORAL, 0.16),
  'coral-faint': withAlpha(CORAL, 0.2),
  'on-track-surface': withAlpha(LIME, 0.2),
};

// Keyed n × 4px, the design's grid. Two named off-grid steps: 1.5 (6px), and 0.5 (2px), the gap
// between a day's number and its figure in the month cell (Figma 9:3396).
const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  25: '100px',
  // Track with AI (Figma 9:3192): a sent photo is 40 x 50, and a message runs at most 65 wide.
  40: '160px',
  50: '200px',
  65: '260px',
};

// Frame 9:3396 opens with the current month this far below its 146pt header. From scroll content 9:3848:
// -126 (content top) + 352 (the month above) + 24 (the gap between months) - 146 = 104.
const scrollOffsets = {
  'calendar-current-month': 104,
};

const borderRadius = {
  sm: '8px',
  md: '10px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
};

// Caption has no line height on purpose: Figma's is "auto", which is the font's own. Nor have amount and display:
// iOS draws text whose line height is below the font's own from the top of its box (and a TextInput clips it),
// where Figma centres it, so each sits centred in a box of Figma's line height instead.
const fontSize = {
  caption: '12px',
  figure: ['12px', { lineHeight: '16px' }],
  label: ['14px', { lineHeight: '20px' }],
  body: ['16px', { lineHeight: '24px' }],
  'body-tight': ['16px', { lineHeight: '20px' }],
  subtitle: ['20px', { lineHeight: '24px' }],
  heading: ['24px', { lineHeight: '24px' }],
  title: ['24px', { lineHeight: '32px' }],
  amount: '80px',
  display: '100px',
  // Track with AI's estimate figure: 40/40 in Figma, kept at the font's own ~55pt line like amount.
  estimate: '40px',
};

// Each weight is its own PostScript name. It MUST equal the name inside the embedded TTF,
// or iOS silently falls back to SF Pro (tokens.test.ts reads the TTFs to hold this).
const fontFamily = {
  'manrope-medium': ['Manrope-Medium'],
  'manrope-semibold': ['Manrope-SemiBold'],
  'manrope-bold': ['Manrope-Bold'],
  // Track with AI's message text and input field.
  'manrope-regular': ['Manrope-Regular'],
};

// A colour and its position down the gradient per stop; Figma leaves the header's fade raw.
const gradients = {
  'header-fade': [
    { color: colors['ink-900'], position: '0%' },
    { color: colors['ink-900'], position: '60%' },
    { color: withAlpha(colors['ink-900'], 0.72), position: '83%' },
    { color: withAlpha(colors['ink-900'], 0), position: '100%' },
  ],
};

// expo-blur's intensity (1-100), matched by eye to the header's Figma background blur, radius 25.
const blurIntensity = {
  header: 80,
};

module.exports = { colors, spacing, scrollOffsets, borderRadius, fontSize, fontFamily, gradients, blurIntensity };
