import type * as NodeCrypto from 'node:crypto';
import { createHash } from 'node:crypto';
import type * as WebBrowserModule from 'expo-web-browser';
import { openAuthSessionAsync, WebBrowserResultType } from 'expo-web-browser';

import { authorizeInBrowser } from './authorize';
import { APP_CALLBACK_URL, CHATGPT_SCOPES, OPENAI_API_RESOURCE, OPENAI_AUTH_ENDPOINTS } from './openai-auth.constants';

// expo-auth-session builds its PKCE pair through expo-crypto; node's crypto stands in for the native module.
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual<typeof NodeCrypto>('node:crypto');

  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { BASE64: 'base64', HEX: 'hex' },
    getRandomValues: (array: Uint8Array<ArrayBuffer>) => nodeCrypto.getRandomValues(array),
    digestStringAsync: (_algorithm: string, data: string, options: { encoding: 'base64' | 'hex' }) =>
      Promise.resolve(nodeCrypto.createHash('sha256').update(data).digest(options.encoding)),
  };
});

jest.mock('expo-web-browser', () => ({
  ...jest.requireActual<typeof WebBrowserModule>('expo-web-browser'),
  openAuthSessionAsync: jest.fn(),
}));

const mockOpen = jest.mocked(openAuthSessionAsync);

const REQUEST = {
  clientId: 'oaiapp_test',
  redirectUri: 'http://127.0.0.1:1455/auth/callback',
  scopes: CHATGPT_SCOPES,
  state: 'state-1',
  nonce: 'nonce-1',
  hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
};

const returnedTo = (query: string) => ({ type: 'success' as const, url: `${APP_CALLBACK_URL}?${query}` });

function openedUrl(): URL {
  return new URL(String(mockOpen.mock.calls[0]?.[0]));
}

describe('authorizeInBrowser', () => {
  it('sends OpenAI the documented authorize request with an S256 PKCE challenge', async () => {
    mockOpen.mockResolvedValue({ type: WebBrowserResultType.CANCEL });

    await authorizeInBrowser(REQUEST);

    const url = openedUrl();
    expect(`${url.origin}${url.pathname}`).toBe(OPENAI_AUTH_ENDPOINTS.authorization);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'oaiapp_test',
      redirect_uri: 'http://127.0.0.1:1455/auth/callback',
      response_type: 'code',
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      resource: OPENAI_API_RESOURCE,
      state: 'state-1',
      nonce: 'nonce-1',
      ext_agent_host_id: REQUEST.hostId,
      code_challenge_method: 'S256',
    });
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('waits for the app callback, whatever redirect OpenAI was sent', async () => {
    mockOpen.mockResolvedValue({ type: WebBrowserResultType.CANCEL });

    await authorizeInBrowser(REQUEST);

    expect(mockOpen.mock.calls[0]?.[1]).toBe(APP_CALLBACK_URL);
  });

  it('returns the code, the issued client and the verifier whose challenge was sent', async () => {
    mockOpen.mockResolvedValue(returnedTo('code=the-code&state=state-1&client_id=oaiapp_test&scope=openid'));

    const result = await authorizeInBrowser(REQUEST);

    expect(result).toMatchObject({ type: 'success', code: 'the-code', state: 'state-1', clientId: 'oaiapp_test' });
    const verifier = result.type === 'success' ? result.codeVerifier : '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(openedUrl().searchParams.get('code_challenge')).toBe(challenge);
  });

  it.each([
    ['closes the sheet', { type: WebBrowserResultType.CANCEL }],
    ['dismisses the session', { type: WebBrowserResultType.DISMISS }],
  ])('reads it as cancelled when the user %s', async (_case, session) => {
    mockOpen.mockResolvedValue(session);

    await expect(authorizeInBrowser(REQUEST)).resolves.toEqual({ type: 'cancelled' });
  });

  it('passes on the error OpenAI sends back, such as a declined consent', async () => {
    mockOpen.mockResolvedValue(returnedTo('error=access_denied&state=state-1'));

    await expect(authorizeInBrowser(REQUEST)).resolves.toEqual({ type: 'error', error: 'access_denied' });
  });

  it('refuses a callback whose state belongs to another attempt', async () => {
    mockOpen.mockResolvedValue(returnedTo('code=the-code&state=someone-else'));

    await expect(authorizeInBrowser(REQUEST)).resolves.toEqual({ type: 'error', error: 'state_mismatch' });
  });

  it('refuses a callback with no code', async () => {
    mockOpen.mockResolvedValue(returnedTo('state=state-1'));

    await expect(authorizeInBrowser(REQUEST)).resolves.toEqual({ type: 'error', error: 'missing_code' });
  });

  it('reports a browser that could not open as an error, not a crash', async () => {
    mockOpen.mockRejectedValue(new Error('Another session is in progress'));

    await expect(authorizeInBrowser(REQUEST)).resolves.toEqual({ type: 'error', error: 'browser_unavailable' });
  });
});
