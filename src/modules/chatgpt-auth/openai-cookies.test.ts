import type { HttpCookieKey } from '../../../modules/http-cookies';
import { createClearOpenAICookies } from './openai-cookies';

interface StoredCookie extends HttpCookieKey {
  readonly value: string;
}

const cookie = (name: string, domain: string, path = '/'): StoredCookie => ({ name, domain, path, value: `${name}-value` });

// What device-proof found in Library/Cookies after a sign-out, beside cookies the app must keep.
const OPENAI = [
  cookie('__oailb', 'api.openai.com'),
  cookie('__cflb', '.openai.com'),
  cookie('__cf_bm', 'auth.openai.com'),
  cookie('oai-did', '.chatgpt.com'),
  cookie('cf_clearance', 'chatgpt.com', '/backend-api'),
  cookie('upper', 'API.OpenAI.COM'),
  cookie('rooted', 'auth.openai.com.'),
];
const UNRELATED = [
  cookie('session', 'example.com'),
  cookie('lookalike', 'notopenai.com'),
  cookie('suffix', 'openai.com.example.net'),
  cookie('longer', 'chatgpt.community'),
  cookie('__cf_bm', '.cloudflare.com'),
];

/** Stands in for ios/HttpCookiesModule.swift over HTTPCookieStorage.shared: it lists keys only, never a value. */
function fakeNative(cookies: readonly StoredCookie[]) {
  let stored = [...cookies];
  const native = {
    list: jest.fn((): Promise<unknown> => Promise.resolve(stored.map(({ name, domain, path }) => ({ name, domain, path })))),
    remove: jest.fn((keys: readonly HttpCookieKey[]) => {
      stored = stored.filter((kept) => !keys.some((key) => key.name === kept.name && key.domain === kept.domain && key.path === kept.path));

      return Promise.resolve();
    }),
  };

  return { native, stored: () => stored };
}

describe('clearing OpenAI’s cookies', () => {
  it('removes every openai.com and chatgpt.com cookie, on any subdomain, path, letter case or root dot', async () => {
    const fake = fakeNative([...OPENAI, ...UNRELATED]);

    await createClearOpenAICookies(fake.native)();

    expect(fake.stored().filter((left) => OPENAI.includes(left))).toEqual([]);
  });

  it('keeps every other site’s cookies, look-alike domains included', async () => {
    const fake = fakeNative([...OPENAI, ...UNRELATED]);

    await createClearOpenAICookies(fake.native)();

    expect(fake.stored()).toEqual(UNRELATED);
  });

  it('asks to remove nothing when no OpenAI cookie is stored', async () => {
    const fake = fakeNative(UNRELATED);

    await createClearOpenAICookies(fake.native)();

    expect(fake.native.remove).not.toHaveBeenCalled();
  });

  it('does nothing in a build without the native module, such as Expo Go or Jest', async () => {
    await expect(createClearOpenAICookies(null)()).resolves.toBeUndefined();
  });

  it('refuses a listing that is not a list, removing nothing', async () => {
    const fake = fakeNative(OPENAI);
    fake.native.list.mockResolvedValueOnce({ cookies: [] });

    await expect(createClearOpenAICookies(fake.native)()).rejects.toThrow('unreadable cookie listing');
    expect(fake.native.remove).not.toHaveBeenCalled();
  });

  it('still removes every OpenAI cookie it can read when one entry is unreadable', async () => {
    const fake = fakeNative(OPENAI);
    const readable = OPENAI.map(({ name, domain, path }) => ({ name, domain, path }));
    fake.native.list.mockResolvedValueOnce([{ name: 'broken', path: '/' }, 'broken', ...readable]);

    await createClearOpenAICookies(fake.native)();

    expect(fake.stored()).toEqual([]);
  });
});
