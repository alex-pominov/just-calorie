const nativewindPreset = require('nativewind/preset');
const { colors, spacing, borderRadius, fontSize, fontFamily } = require('./src/modules/theme/tokens');

// NativeWind's native preset EXTENDS fonts, letter spacing, shadows and the switch/ripple colours with
// stock values, and an extension merges past a replaced scale. Those are dropped here and take the
// tokens below; the rest of the preset is kept, its marker included.
const STOCK_DESIGN_EXTENSIONS = new Set([
  'fontFamily',
  'letterSpacing',
  'boxShadow',
  'elevation',
  'trackColor',
  'thumbColor',
  'rippleColor',
]);

const designPreset = Object.assign(
  () => {
    const preset = nativewindPreset();
    const extend = Object.fromEntries(
      Object.entries(preset.theme.extend).filter(([key]) => !STOCK_DESIGN_EXTENSIONS.has(key)),
    );

    return { ...preset, theme: { ...preset.theme, extend } };
  },
  { nativewind: true },
);

// Every design scale REPLACES Tailwind's stock one, so an off-design value cannot be typed by accident.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [designPreset],
  theme: {
    colors,
    spacing,
    borderRadius,
    fontSize,
    fontFamily,
    fontWeight: {},
    lineHeight: {},
    letterSpacing: {},
    boxShadow: {},
    dropShadow: {},
    ringColor: colors,
    trackColor: colors,
    thumbColor: colors,
    rippleColor: colors,
  },
  plugins: [],
};
