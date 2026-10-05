const { colors } = require('./src/modules/theme/tokens');

const DEFAULT_METRO_PORT = 8081;
// STUDIO_SLOT, when set, offsets Metro's port by 100 per slot (8081 + 100 x slot), so several checkouts run side by side.
const METRO_PORTS_PER_SLOT = 100;

function metroPort() {
  const slot = process.env.STUDIO_SLOT;

  if (slot === undefined || slot === '') {
    return DEFAULT_METRO_PORT;
  }

  if (!/^\d+$/.test(slot)) {
    throw new Error('STUDIO_SLOT must be a whole number');
  }

  return DEFAULT_METRO_PORT + METRO_PORTS_PER_SLOT * Number(slot);
}

const isProductionBuild = () => process.env.NODE_ENV === 'production' || process.env.EAS_BUILD_PROFILE === 'production';

// Development builds only: prebuild bakes these into Info.plist, and a released app must not carry a
// localhost launcher URL. A production build still gets expo-dev-client, prop-less, as a dependency.
function devOnlyPlugins() {
  if (isProductionBuild()) {
    return [];
  }

  return [
    [
      'expo-dev-client',
      {
        toolsButton: false,
        skipOnboarding: true,
        showMenuAtLaunch: false,
        defaultLaunchURL: `http://localhost:${metroPort()}`,
      },
    ],
  ];
}

// Extends app.json with values that must come from the design tokens or from the build. No build setting carries a
// credential: each user signs in with ChatGPT and registers their own client.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['expo-splash-screen', { backgroundColor: colors['ink-900'] }],
    ...devOnlyPlugins(),
  ],
});
