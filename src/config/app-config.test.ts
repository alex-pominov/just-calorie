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
  it('opens a development build straight into this worktree’s Metro, with no tools button or launcher', () => {
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
    const DEV_KEY = 'sk-dev-FAKE-0123456789';
    const OWNER_DEV_CLIENT = 'oaiapp_owner_dev';
    const LOOPBACK = 'http://127.0.0.1:1455/auth/callback';
    const DEV_SERVER: BuildEnv = { JUST_CALORIE_DEV_SERVER: '1' };
    const credentials: BuildEnv = {
      OPENAI_API_KEY: DEV_KEY,
      CHATGPT_DEV_CLIENT_ID: OWNER_DEV_CLIENT,
      CHATGPT_DEV_REDIRECT_URI: LOOPBACK,
      CHATGPT_CLIENT_ID: 'oaiapp_app_wide',
    };

    it("gives the dev server the dev key and the owner's dev client on its loopback redirect", () => {
      const config = configFor({ NODE_ENV: 'development', ...DEV_SERVER, ...credentials });

      expect(config.extra?.calorieEstimate).toMatchObject({ apiKey: DEV_KEY });
      expect(config.extra?.chatgptAuth).toEqual({ clientId: OWNER_DEV_CLIENT, redirectUri: LOOPBACK });
    });

    it('falls back to the app-wide client on the dev server when no dev client is set', () => {
      const config = configFor({ NODE_ENV: 'development', ...DEV_SERVER, CHATGPT_CLIENT_ID: 'oaiapp_app_wide' });

      expect(config.extra?.chatgptAuth).toEqual({ clientId: 'oaiapp_app_wide' });
    });

    it("publishes none of the owner's credentials in an 'eas update' manifest, which 'expo config' evaluates as development", () => {
      const config = configFor({ NODE_ENV: 'development', ...credentials });
      const everything = JSON.stringify(config);

      expect(everything).not.toContain(DEV_KEY);
      expect(everything).not.toContain(OWNER_DEV_CLIENT);
      expect(everything).not.toContain(LOOPBACK);
    });

    it.each<BuildEnv>([{ NODE_ENV: 'production' }, { EAS_BUILD_PROFILE: 'production' }, {}, { NODE_ENV: 'development' }])(
      "never ships the owner's dev client as the app-wide client when both are set to it (%p)",
      (env) => {
        const config = configFor({ ...env, CHATGPT_DEV_CLIENT_ID: OWNER_DEV_CLIENT, CHATGPT_CLIENT_ID: OWNER_DEV_CLIENT });

        expect(config.extra?.chatgptAuth).toEqual({});
        expect(JSON.stringify(config)).not.toContain(OWNER_DEV_CLIENT);
      },
    );

    it.each<BuildEnv>([
      { CHATGPT_DEV_CLIENT_ID: OWNER_DEV_CLIENT, CHATGPT_CLIENT_ID: ` ${OWNER_DEV_CLIENT}\n` },
      { CHATGPT_DEV_CLIENT_ID: ` ${OWNER_DEV_CLIENT} `, CHATGPT_CLIENT_ID: OWNER_DEV_CLIENT },
    ])("never ships the owner's dev client when one copy is padded with whitespace, as the app reads it trimmed (%p)", (clients) => {
      const config = configFor({ NODE_ENV: 'production', ...clients });

      expect(config.extra?.chatgptAuth).toEqual({});
      expect(JSON.stringify(config)).not.toContain(OWNER_DEV_CLIENT);
    });

    it('marks the dev server in the start script, and keeps Metro on localhost', () => {
      const start = /"start":\s*"([^"]*)"/.exec(readFileSync(join(__dirname, '../../package.json'), 'utf8'))?.[1] ?? '';

      expect(start).toMatch(/(^|\s)JUST_CALORIE_DEV_SERVER=1\s.*expo start --localhost/);
    });

    it.each<BuildEnv>([{ NODE_ENV: 'production' }, { EAS_BUILD_PROFILE: 'production' }])(
      "ships a production build with no API key and no owner client, only the app-wide client (%p)",
      (env) => {
        const config = configFor({ ...env, ...credentials });
        const everything = JSON.stringify(config);

        expect(config.extra?.chatgptAuth).toEqual({ clientId: 'oaiapp_app_wide' });
        expect(everything).not.toContain(DEV_KEY);
        expect(everything).not.toContain(OWNER_DEV_CLIENT);
        expect(everything).not.toContain(LOOPBACK);
      },
    );

    it('gives a build that does not say it is development, such as an Xcode archive, none of the owner’s credentials', () => {
      const config = configFor(credentials);
      const everything = JSON.stringify(config);

      expect(everything).not.toContain(DEV_KEY);
      expect(everything).not.toContain(OWNER_DEV_CLIENT);
      expect(everything).not.toContain(LOOPBACK);
    });

    it('keeps the base URL override out of a production build, since every request there carries a user token', () => {
      const config = configFor({ NODE_ENV: 'production', CALORIE_ESTIMATE_BASE_URL: 'http://127.0.0.1:9' });

      expect(JSON.stringify(config)).not.toContain('127.0.0.1:9');
    });

    it('ships a production build with no client at all when no app-wide client is set', () => {
      const config = configFor({ NODE_ENV: 'production', OPENAI_API_KEY: DEV_KEY, CHATGPT_DEV_CLIENT_ID: OWNER_DEV_CLIENT });

      expect(config.extra?.chatgptAuth).toEqual({});
      expect(config.extra?.calorieEstimate).not.toHaveProperty('apiKey');
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
