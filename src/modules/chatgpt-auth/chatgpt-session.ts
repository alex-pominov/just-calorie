import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { authorizeInBrowser } from './authorize';
import { createChatGPTAuth } from './chatgpt-auth';
import { getChatGPTAuthConfig } from './chatgpt-auth.config';
import { keychainStore } from './keychain-store';

/** Where a user reviews and limits what apps spend of their ChatGPT plan (OpenAI's UI guidelines). */
export const CHATGPT_USAGE_SETTINGS_URL = 'https://chatgpt.com/settings/usage';

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** The app's one ChatGPT session: the Keychain, the iOS auth session and OpenAI's token endpoint. */
export const chatGPTSession = createChatGPTAuth({
  getConfig: getChatGPTAuthConfig,
  store: keychainStore,
  fetch: (url, init) => fetch(url, init),
  authorize: authorizeInBrowser,
  randomToken: () => base64Url(Crypto.getRandomValues(new Uint8Array(32))),
  newHostId: () => `urn:uuid:${Crypto.randomUUID()}`,
  now: () => Date.now(),
});

/** Opens ChatGPT's usage settings in an in-app browser sheet. */
export async function openChatGPTUsageSettings(): Promise<void> {
  await WebBrowser.openBrowserAsync(CHATGPT_USAGE_SETTINGS_URL);
}
