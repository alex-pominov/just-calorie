const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Agents rewrite .claude/ (studio state) and .expo/ (CLI logs) on every tool call. Watched, those writes
// send the dev client empty hot-update cycles, each flashing a 'Refreshing...' banner that swallows taps.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unwatchedRoots = ['.claude', '.expo'].map((directory) => new RegExp(`^${escapeRegExp(path.join(__dirname, directory))}/`));
config.resolver.blockList = [...[].concat(config.resolver.blockList ?? []), ...unwatchedRoots];

// inlineRem MUST stay 16: NativeWind defaults to 14, which silently puts the Tailwind
// scale on a 3.5px grid (gap-2 = 7px) instead of the design's 4px grid. Baked at
// transform time — a change needs `bun start -c`.
module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
