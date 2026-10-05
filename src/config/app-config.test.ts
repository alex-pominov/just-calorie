import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import buildAppConfig from '../../app.config';
import appJson from '../../app.json';

const BUILD_ENV_KEYS = [
  'NODE_ENV',
  'EAS_BUILD_PROFILE',
  'JUST_CALORIE_DEV_SERVER',
  'STUDIO_SLOT',
  'OPENAI_API_KEY',
  'CALORIE_ESTIMATE_BASE_URL',
  'CHATGPT_CLIENT_ID',
  'CHATGPT_DEV_CLIENT_ID',
  'CHATGPT_DEV_REDIRECT_URI',
] as const;

type BuildEnv = Partial<Record<(typeof BUILD_ENV_KEYS)[number], string>>;

const replaceBuildEnv = (env: BuildEnv) => {
  BUILD_ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
  Object.assign(process.env, env);
};

const configFor = (env: BuildEnv) => {
  const saved = Object.fromEntries(BUILD_ENV_KEYS.flatMap((key) => (key in process.env ? [[key, process.env[key]]] : [])));
  replaceBuildEnv(env);

  try {
    return buildAppConfig({ config: appJson.expo });
  } finally {
    replaceBuildEnv(saved);
  }
};

const devClientPluginsOf = (config: { plugins?: unknown[] }) =>
  (config.plugins ?? []).filter((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-dev-client');

describe('app config', () => {
  it('opens a development build straight into its slot’s Metro, with no tools button or launcher', () => {
    const config = configFor({ NODE_ENV: 'development', STUDIO_SLOT: '33' });

    expect(devClientPluginsOf(config)).toEqual([
      [
        'expo-dev-client',
        { toolsButton: false, skipOnboarding: true, showMenuAtLaunch: false, defaultLaunchURL: 'http://localhost:11381' },
      ],
    ]);
  });

  it('points a development build with no runtime slot at Metro’s default port', () => {
    const config = configFor({});

    expect(devClientPluginsOf(config)).toEqual([
      ['expo-dev-client', expect.objectContaining({ defaultLaunchURL: 'http://localhost:8081' })],
    ]);
  });

  it.each<BuildEnv>([
    { NODE_ENV: 'production', STUDIO_SLOT: '33' },
    { EAS_BUILD_PROFILE: 'production', STUDIO_SLOT: '33' },
  ])('ships a production build with no dev-client options and no localhost URL (%p)', (env) => {
    const config = configFor(env);

    expect(devClientPluginsOf(config)).toEqual([]);
    expect(JSON.stringify(config.plugins)).not.toContain('localhost');
  });

  describe('the AI credentials', () => {
    // Variables older builds read: a development OpenAI key, a base-URL override, the flag that marked the dev server,
    // and an app-wide ChatGPT client. Each user now registers their own client, so none may reach any config.
    const RETIRED_VALUES: BuildEnv = {
      OPENAI_API_KEY: 'sk-dev-FAKE-0123456789',
      CALORIE_ESTIMATE_BASE_URL: 'http://127.0.0.1:9',
      CHATGPT_CLIENT_ID: 'oaiapp_app_wide',
      CHATGPT_DEV_CLIENT_ID: 'oaiapp_owner_dev',
      CHATGPT_DEV_REDIRECT_URI: 'http://127.0.0.1:1455/auth/callback',
    };

    it.each<BuildEnv>([
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production' },
      { EAS_BUILD_PROFILE: 'production' },
      {},
    ])('carries no key, no base-URL override and no client, whatever the environment sets (%p)', (env) => {
      const config = configFor({ ...env, JUST_CALORIE_DEV_SERVER: '1', ...RETIRED_VALUES });
      const everything = JSON.stringify(config);

      expect(config.extra).not.toHaveProperty('calorieEstimate');
      expect(config.extra).not.toHaveProperty('chatgptAuth');
      Object.values(RETIRED_VALUES).forEach((value) => expect(everything).not.toContain(value));
    });

    it('keeps Metro on 127.0.0.1, IPv4 first, with no dev-server flag left in the start script', () => {
      const start = /"start":\s*"([^"]*)"/.exec(readFileSync(join(__dirname, '../../package.json'), 'utf8'))?.[1] ?? '';

      expect(start).toBe('NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost');
    });
  });

  // The App Store refuses an icon with an alpha channel, and iOS masks the corners itself (Figma 15:4251).
  it('sets the iOS icon to the committed 1024 x 1024 PNG, with no alpha channel', () => {
    const iconPath = configFor({}).icon ?? '';
    const png = readFileSync(join(__dirname, '../..', iconPath));
    const PNG_SIGNATURE = '89504e470d0a1a0a';
    const RGB_COLOUR_TYPE = 2;

    expect(iconPath).toBe('./src/assets/images/app-icon.png');
    expect(png.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png.readUInt8(25)]).toEqual([1024, 1024, RGB_COLOUR_TYPE]);
  });

  it('refuses a runtime slot that is not a whole number', () => {
    const build = () => configFor({ STUDIO_SLOT: 'thirty' });

    expect(build).toThrow('STUDIO_SLOT');
  });
});
