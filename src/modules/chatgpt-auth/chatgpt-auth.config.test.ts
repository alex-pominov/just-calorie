import appJson from '../../../app.json';
import { getChatGPTAuthConfig, readChatGPTAuthConfig } from './chatgpt-auth.config';
import { APP_CALLBACK_URL } from './openai-auth.constants';

const mockExtra: { current: unknown } = { current: undefined };

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra.current };
    },
  },
}));

const DEV = { isDevelopmentBundle: true };

describe('readChatGPTAuthConfig', () => {
  it('ignores a loopback redirect in a production bundle, so a release always returns on the app callback', () => {
    const config = readChatGPTAuthConfig(
      { chatgptAuth: { clientId: 'oaiapp_test', redirectUri: 'http://127.0.0.1:1455/auth/callback' } },
      { isDevelopmentBundle: false },
    );

    expect(config.redirectUri).toBe(APP_CALLBACK_URL);
  });

  it('reads the client id and defaults the redirect to the app callback', () => {
    expect(readChatGPTAuthConfig({ chatgptAuth: { clientId: ' oaiapp_test ' } }, DEV)).toEqual({
      clientId: 'oaiapp_test',
      redirectUri: APP_CALLBACK_URL,
    });
  });

  it('takes a loopback redirect override, the only one a self-serve client accepts', () => {
    const config = readChatGPTAuthConfig({ chatgptAuth: { clientId: 'oaiapp_test', redirectUri: 'http://127.0.0.1:1455/auth/callback' } }, DEV);

    expect(config.redirectUri).toBe('http://127.0.0.1:1455/auth/callback');
  });

  it.each([
    ['localhost, which OpenAI refuses for loopback', 'http://localhost:1455/auth/callback'],
    ['another host', 'https://example.com/auth/callback'],
    ['a loopback with the wrong path', 'http://127.0.0.1:1455/callback'],
    ['a blank value', '  '],
  ])('ignores a redirect override that is %s', (_case, redirectUri) => {
    expect(readChatGPTAuthConfig({ chatgptAuth: { clientId: 'oaiapp_test', redirectUri } }, DEV).redirectUri).toBe(APP_CALLBACK_URL);
  });

  it.each([
    ['no extra at all', undefined],
    ['no chatgptAuth section', { router: {} }],
    ['an empty client id', { chatgptAuth: { clientId: '' } }],
    ['a client id that is not a string', { chatgptAuth: { clientId: 42 } }],
  ])('reads %s as no client', (_case, extra) => {
    expect(readChatGPTAuthConfig(extra, DEV)).toEqual({ clientId: null, redirectUri: APP_CALLBACK_URL });
  });
});

describe('getChatGPTAuthConfig', () => {
  it("reads expo-constants' extra on every call", () => {
    mockExtra.current = { chatgptAuth: { clientId: 'oaiapp_first' } };
    expect(getChatGPTAuthConfig().clientId).toBe('oaiapp_first');

    mockExtra.current = undefined;
    expect(getChatGPTAuthConfig().clientId).toBeNull();
  });
});

describe('the app callback', () => {
  it("is on the scheme app.json registers, so iOS hands the sign-in result back to this app", () => {
    expect(APP_CALLBACK_URL.startsWith(`${appJson.expo.scheme}://`)).toBe(true);
  });
});
