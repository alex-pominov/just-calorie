import Constants from 'expo-constants';

import type { EstimateConfig } from './calorie-estimate.types';

export const DEFAULT_ESTIMATE_BASE_URL = 'https://api.openai.com/v1';

function readSetting(section: unknown, key: string): string | null {
  const value = typeof section === 'object' && section !== null && key in section ? Reflect.get(section, key) : undefined;

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Reads `extra.calorieEstimate` as app.config.js writes it for a development build: `apiKey` from OPENAI_API_KEY and
 * `baseUrl` from CALORIE_ESTIMATE_BASE_URL. Outside a development bundle both are ignored.
 */
export function readEstimateConfig(extra: unknown, options: { readonly isDevelopmentBundle: boolean }): EstimateConfig {
  const section = typeof extra === 'object' && extra !== null && 'calorieEstimate' in extra ? extra.calorieEstimate : undefined;
  const baseUrl = (options.isDevelopmentBundle ? readSetting(section, 'baseUrl') : null) ?? DEFAULT_ESTIMATE_BASE_URL;

  return {
    devApiKey: options.isDevelopmentBundle ? readSetting(section, 'apiKey') : null,
    baseUrl: baseUrl.replace(/\/+$/, ''),
  };
}

/** The one accessor for the development key and the base URL. Never log what it returns. */
export function getEstimateConfig(): EstimateConfig {
  return readEstimateConfig(Constants.expoConfig?.extra, { isDevelopmentBundle: __DEV__ });
}
