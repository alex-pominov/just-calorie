import { DEFAULT_ESTIMATE_BASE_URL, getEstimateConfig, readEstimateConfig } from './estimate-config';

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

describe('readEstimateConfig', () => {
  it('reads the key and falls back to OpenAI for the base URL', () => {
    expect(readEstimateConfig({ calorieEstimate: { apiKey: 'sk-test' } }, DEV)).toEqual({
      devApiKey: 'sk-test',
      baseUrl: DEFAULT_ESTIMATE_BASE_URL,
    });
  });

  it('takes an override base URL without its trailing slash', () => {
    expect(readEstimateConfig({ calorieEstimate: { apiKey: 'sk-test', baseUrl: 'http://127.0.0.1:9/' } }, DEV).baseUrl).toBe(
      'http://127.0.0.1:9',
    );
  });

  it('ignores a base URL override in a production bundle, so no user token is sent anywhere but OpenAI', () => {
    expect(readEstimateConfig({ calorieEstimate: { baseUrl: 'http://127.0.0.1:9' } }, { isDevelopmentBundle: false }).baseUrl).toBe(
      DEFAULT_ESTIMATE_BASE_URL,
    );
  });

  it('ignores a key in a production bundle, so no estimate there can bill the key’s owner', () => {
    expect(readEstimateConfig({ calorieEstimate: { apiKey: 'sk-test' } }, { isDevelopmentBundle: false }).devApiKey).toBeNull();
  });

  it.each([
    ['no extra at all', undefined],
    ['no calorieEstimate section', { router: {} }],
    ['an absent key', { calorieEstimate: {} }],
    ['an empty key', { calorieEstimate: { apiKey: '' } }],
    ['a blank key', { calorieEstimate: { apiKey: '   ' } }],
    ['a key that is not a string', { calorieEstimate: { apiKey: 42 } }],
  ])('reads %s as no key', (_case, extra) => {
    expect(readEstimateConfig(extra, DEV)).toEqual({ devApiKey: null, baseUrl: DEFAULT_ESTIMATE_BASE_URL });
  });
});

describe('getEstimateConfig', () => {
  it("reads expo-constants' extra on every call", () => {
    mockExtra.current = { calorieEstimate: { apiKey: 'sk-first' } };
    expect(getEstimateConfig().devApiKey).toBe('sk-first');

    mockExtra.current = undefined;
    expect(getEstimateConfig().devApiKey).toBeNull();
  });
});
