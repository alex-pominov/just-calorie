import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';

import { httpCookiesNative } from '../../../modules/http-cookies';
import { loopbackCallbackNative } from '../../../modules/loopback-callback';
import { createAuthorize } from './authorize';
import { createChatGPTAuth } from './chatgpt-auth';
import { keychainStore } from './keychain-store';
import { createLoopbackCallbacks } from './loopback-callback';
import { createClearOpenAICookies } from './openai-cookies';

/** Where a user reviews and limits what apps spend of their ChatGPT plan (OpenAI's UI guidelines). */
export const CHATGPT_USAGE_SETTINGS_URL = 'https://chatgpt.com/settings/usage';

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** The app's one ChatGPT session: the Keychain, the auth sheet over the loopback listener, OpenAI's token endpoint and cookies. */
export const chatGPTSession = createChatGPTAuth({
  store: keychainStore,
  fetch: (url, init) => fetch(url, init),
  authorize: createAuthorize(createLoopbackCallbacks(loopbackCallbackNative)),
  randomToken: () => base64Url(Crypto.getRandomValues(new Uint8Array(32))),
  newHostId: () => `urn:uuid:${Crypto.randomUUID()}`,
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  clearCookies: createClearOpenAICookies(httpCookiesNative),
});

/** Opens ChatGPT's usage settings in the system browser, so no chatgpt.com login is kept in Just Calorie's own data. */
export async function openChatGPTUsageSettings(): Promise<void> {
  await Linking.openURL(CHATGPT_USAGE_SETTINGS_URL);
}
