import { openURL } from 'expo-linking';
import type * as WebBrowserModule from 'expo-web-browser';
import { openBrowserAsync } from 'expo-web-browser';

import { httpCookiesNative } from '../../../modules/http-cookies';
import { CHATGPT_USAGE_SETTINGS_URL, chatGPTSession, openChatGPTUsageSettings } from './chatgpt-session';

jest.mock('expo-linking', () => ({ openURL: jest.fn(() => Promise.resolve(true)) }));

// A phone where nobody is signed in: the Keychain holds nothing.
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// The native cookie store, holding one of OpenAI's cookies and another site's.
jest.mock('../../../modules/http-cookies', () => ({
  httpCookiesNative: {
    list: jest.fn(() =>
      Promise.resolve([
        { name: '__oailb', domain: 'api.openai.com', path: '/' },
        { name: 'session', domain: 'example.com', path: '/' },
      ]),
    ),
    remove: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('expo-web-browser', () => ({
  ...jest.requireActual<typeof WebBrowserModule>('expo-web-browser'),
  openBrowserAsync: jest.fn(),
}));

const mockOpenURL = jest.mocked(openURL);

describe('ChatGPT usage settings', () => {
  it('open in the system browser, so no chatgpt.com login is kept in Just Calorie’s in-app browser data (backlog 17)', async () => {
    await openChatGPTUsageSettings();

    expect(mockOpenURL.mock.calls).toEqual([[CHATGPT_USAGE_SETTINGS_URL]]);
    expect(openBrowserAsync).not.toHaveBeenCalled();
  });

  it('reject when the browser will not open, so the screen can say so', async () => {
    mockOpenURL.mockRejectedValueOnce(new Error('no browser'));

    await expect(openChatGPTUsageSettings()).rejects.toThrow('no browser');
  });
});

/** Lets every pending promise callback run, such as the clear a signed-out load starts without awaiting. */
const flush = async () => {
  for (let step = 0; step < 100; step += 1) await Promise.resolve();
};

describe('the app’s ChatGPT session', () => {
  it('clears OpenAI’s cookies from the native cookie store on sign-out, and no other site’s', async () => {
    await chatGPTSession.load();
    await flush();
    jest.mocked(httpCookiesNative?.remove)?.mockClear();

    await chatGPTSession.signOut();

    expect(httpCookiesNative?.remove).toHaveBeenCalledWith([{ name: '__oailb', domain: 'api.openai.com', path: '/' }]);
  });
});
