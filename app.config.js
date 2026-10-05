const { colors } = require('./src/modules/theme/tokens');

const DEFAULT_METRO_PORT = 8081;
// The studio runs each worktree's Metro on 8081 + 100 x its runtime slot (.claude/state/runtime.env).
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

// Every value that would spend the OWNER's OpenAI account (the API key, the owner's own ChatGPT client) and the base
// URL override go only into the config the dev server serves: `bun start` sets JUST_CALORIE_DEV_SERVER. NODE_ENV alone
// is not proof, because `expo config` also sets it to development, and that is how `eas update` builds its manifest.
const isDevelopmentServer = () =>
  process.env.JUST_CALORIE_DEV_SERVER === '1' && process.env.NODE_ENV === 'development' && !isProductionBuild();

// .env may set CHATGPT_CLIENT_ID to the owner's dev client, which a native build would otherwise embed. Compared
// trimmed, as the app reads the value (src/modules/chatgpt-auth/chatgpt-auth.config.ts).
function appWideClientId() {
  const clientId = process.env.CHATGPT_CLIENT_ID;

  return clientId !== undefined && clientId.trim() === process.env.CHATGPT_DEV_CLIENT_ID?.trim() ? undefined : clientId;
}

function aiCredentials() {
  if (!isDevelopmentServer()) {
    return { calorieEstimate: {}, chatgptAuth: { clientId: appWideClientId() } };
  }

  return {
    calorieEstimate: { apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.CALORIE_ESTIMATE_BASE_URL },
    chatgptAuth: {
      clientId: process.env.CHATGPT_DEV_CLIENT_ID ?? process.env.CHATGPT_CLIENT_ID,
      redirectUri: process.env.CHATGPT_DEV_REDIRECT_URI,
    },
  };
}

// Extends app.json with values that must come from the design tokens or from the build, and with the AI settings
// read from the environment (.env is loaded by Expo CLI).
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['expo-splash-screen', { backgroundColor: colors['ink-900'] }],
    ...devOnlyPlugins(),
  ],
  extra: {
    ...config.extra,
    ...aiCredentials(),
  },
});
