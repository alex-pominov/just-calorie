import Constants from 'expo-constants';

import type { ChatGPTAuthConfig } from './chatgpt-auth.types';
import { APP_CALLBACK_URL } from './openai-auth.constants';

// OpenAI's self-serve clients accept only this loopback shape: 127.0.0.1, never localhost, path /auth/callback.
const LOOPBACK_REDIRECT = /^http:\/\/127\.0\.0\.1:\d{1,5}\/auth\/callback$/;

function readSetting(section: unknown, key: string): string | null {
  const value = typeof section === 'object' && section !== null && key in section ? Reflect.get(section, key) : undefined;

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Reads `extra.chatgptAuth` as app.config.js writes it; the loopback redirect counts in a development bundle only. */
export function readChatGPTAuthConfig(extra: unknown, options: { readonly isDevelopmentBundle: boolean }): ChatGPTAuthConfig {
  const section = typeof extra === 'object' && extra !== null && 'chatgptAuth' in extra ? extra.chatgptAuth : undefined;
  const redirectOverride = options.isDevelopmentBundle ? readSetting(section, 'redirectUri') : null;

  return {
    clientId: readSetting(section, 'clientId'),
    redirectUri: redirectOverride !== null && LOOPBACK_REDIRECT.test(redirectOverride) ? redirectOverride : APP_CALLBACK_URL,
  };
}

/** The one accessor for the sign-in client. Both values are public identifiers, not secrets. */
export function getChatGPTAuthConfig(): ChatGPTAuthConfig {
  return readChatGPTAuthConfig(Constants.expoConfig?.extra, { isDevelopmentBundle: __DEV__ });
}
