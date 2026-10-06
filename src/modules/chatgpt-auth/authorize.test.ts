import type * as NodeCrypto from 'node:crypto';
import { createHash } from 'node:crypto';
import type * as WebBrowserModule from 'expo-web-browser';
import { dismissAuthSession, openAuthSessionAsync, WebBrowserResultType } from 'expo-web-browser';

import type { AuthorizeRequest } from './authorize';
import { createAuthorize } from './authorize';
import { ChatGPTAuthError } from './chatgpt-auth-error';
import type { LoopbackCallbackParams, LoopbackOutcome, LoopbackStartRequest } from './loopback-callback';
import { CHATGPT_SCOPES, OPENAI_API_RESOURCE, OPENAI_AUTH_ENDPOINTS } from './openai-auth.constants';

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
  dismissAuthSession: jest.fn(),
}));

const mockOpen = jest.mocked(openAuthSessionAsync);
const mockDismiss = jest.mocked(dismissAuthSession);

const REDIRECT = 'http://127.0.0.1:53662/auth/callback';

const FIRST_REGISTRATION: AuthorizeRequest = {
  clientId: 'dynamic_agent_client',
  scopes: CHATGPT_SCOPES,
  state: 'state-1',
  nonce: 'nonce-1',
  hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
  agentNameHint: 'Just Calorie',
  loginHint: null,
  prompt: null,
};

const REAUTHORIZATION: AuthorizeRequest = {
  ...FIRST_REGISTRATION,
  clientId: 'oaiapp_saved',
  agentNameHint: null,
  loginHint: 'me@example.com',
};

/** A listener the test settles: `arrive` delivers a callback, and `stop` ends a pending one as cancelled. */
function fakeListener() {
  let settle: (outcome: LoopbackOutcome) => void = () => undefined;
  const outcome = new Promise<LoopbackOutcome>((resolve) => {
    settle = resolve;
  });
  const listener = {
    redirectUri: REDIRECT,
    outcome,
    stop: jest.fn(() => {
      settle({ type: 'cancelled' });
      return Promise.resolve();
    }),
  };
  const start = jest.fn((_request: LoopbackStartRequest) => Promise.resolve(listener));

  return {
    listener,
    start,
    authorize: createAuthorize(start),
    arrive: (params: LoopbackCallbackParams) => settle({ type: 'callback', params }),
    end: (ended: LoopbackOutcome) => settle(ended),
  };
}

/** The sheet stays open until the test dismisses or closes it. */
function sheetOpenUntilDismissed() {
  let close: (type: WebBrowserResultType) => void = () => undefined;

  mockOpen.mockImplementation(
    () =>
      new Promise((resolve) => {
        close = (type) => resolve({ type });
      }),
  );
  mockDismiss.mockImplementation(() => close(WebBrowserResultType.DISMISS));

  return { closeByUser: () => close(WebBrowserResultType.CANCEL) };
}

function openedUrl(): URL {
  return new URL(String(mockOpen.mock.calls[0]?.[0]));
}

describe('authorizeInBrowser', () => {
  beforeEach(() => {
    sheetOpenUntilDismissed();
  });

  it('starts the listener for this attempt’s state before opening the browser', async () => {
    const fake = fakeListener();
    fake.start.mockImplementationOnce(async () => {
      expect(mockOpen).not.toHaveBeenCalled();
      return fake.listener;
    });

    const pending = fake.authorize(FIRST_REGISTRATION);
    await Promise.resolve();
    fake.arrive({ code: 'c', state: 'state-1' });
    await pending;

    expect(fake.start).toHaveBeenCalledWith({ state: 'state-1' });
  });

  it('sends a first registration with dynamic_agent_client, the app name, the host id and the bound loopback redirect', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'c', state: 'state-1', client_id: 'oaiapp_new' });
    await pending;

    const url = openedUrl();
    expect(`${url.origin}${url.pathname}`).toBe(OPENAI_AUTH_ENDPOINTS.authorization);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'dynamic_agent_client',
      agent_name_hint: 'Just Calorie',
      redirect_uri: REDIRECT,
      response_type: 'code',
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      resource: OPENAI_API_RESOURCE,
      state: 'state-1',
      nonce: 'nonce-1',
      ext_agent_host_id: FIRST_REGISTRATION.hostId,
      code_challenge_method: 'S256',
    });
    expect(url.searchParams.has('login_hint')).toBe(false);
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('sends a reauthorization with the saved client and its login hint, and no agent name', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(REAUTHORIZATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'c', state: 'state-1' });
    await pending;

    const params = Object.fromEntries(openedUrl().searchParams);
    expect(params).toMatchObject({ client_id: 'oaiapp_saved', login_hint: 'me@example.com', redirect_uri: REDIRECT });
    expect(params).not.toHaveProperty('agent_name_hint');
  });

  it('asks for consent again only when told to, as after a declined plan use', async () => {
    const fake = fakeListener();

    const pending = fake.authorize({ ...REAUTHORIZATION, prompt: 'consent' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'c', state: 'state-1' });
    await pending;

    expect(openedUrl().searchParams.get('prompt')).toBe('consent');
  });

  it('sends no prompt on an ordinary sign-in', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(REAUTHORIZATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'c', state: 'state-1' });
    await pending;

    expect(openedUrl().searchParams.has('prompt')).toBe(false);
  });

  it('opens a sheet that watches for no redirect, since the listener takes the callback', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'c', state: 'state-1' });
    await pending;

    expect(mockOpen.mock.calls[0]?.[1]).toBeNull();
  });

  it('opens the sheet as a private session, so no chatgpt.com login outlives the app’s sign-out (backlog 17)', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(REAUTHORIZATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'c', state: 'state-1' });
    await pending;

    expect(mockOpen.mock.calls[0]?.[2]).toEqual({ preferEphemeralSession: true });
  });

  it('returns the code, the issued client, the verifier whose challenge was sent and the redirect, then dismisses the sheet and stops the listener', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'the-code', state: 'state-1', client_id: 'oaiapp_new', scope: 'openid' });
    const result = await pending;

    expect(result).toMatchObject({ type: 'success', code: 'the-code', state: 'state-1', clientId: 'oaiapp_new', redirectUri: REDIRECT });
    const verifier = result.type === 'success' ? result.codeVerifier : '';
    expect(openedUrl().searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(fake.listener.stop).toHaveBeenCalled();
  });

  it('reads a reauthorization callback that omits the client as naming none', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(REAUTHORIZATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'c', state: 'state-1' });

    await expect(pending).resolves.toMatchObject({ type: 'success', clientId: null });
  });

  it('reads a sheet the user closed as cancelled, and stops the listener', async () => {
    const sheet = sheetOpenUntilDismissed();
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    sheet.closeByUser();

    await expect(pending).resolves.toEqual({ type: 'cancelled' });
    expect(fake.listener.stop).toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('keeps a callback that arrived as the user closed the sheet', async () => {
    const sheet = sheetOpenUntilDismissed();
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ code: 'late-code', state: 'state-1', client_id: 'oaiapp_new' });
    sheet.closeByUser();

    await expect(pending).resolves.toMatchObject({ type: 'success', code: 'late-code' });
  });

  it('passes on the error OpenAI sends back, such as a declined consent', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ error: 'access_denied', state: 'state-1' });

    await expect(pending).resolves.toEqual({ type: 'error', error: 'access_denied' });
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('refuses a callback with no code', async () => {
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.arrive({ state: 'state-1' });

    await expect(pending).resolves.toEqual({ type: 'error', error: 'missing_code' });
  });

  it.each<[LoopbackOutcome, string]>([
    [{ type: 'timeout' }, 'callback_timeout'],
    [{ type: 'failed' }, 'callback_failed'],
  ])('dismisses the sheet and reports a listener that ended with %p', async (ended, error) => {
    const fake = fakeListener();

    const pending = fake.authorize(FIRST_REGISTRATION);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fake.end(ended);

    await expect(pending).resolves.toEqual({ type: 'error', error });
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('reports a browser that could not open as an error, not a crash, and stops the listener', async () => {
    mockOpen.mockRejectedValue(new Error('Another session is in progress'));
    const fake = fakeListener();

    await expect(fake.authorize(FIRST_REGISTRATION)).resolves.toEqual({ type: 'error', error: 'browser_unavailable' });
    expect(fake.listener.stop).toHaveBeenCalled();
  });

  it('opens no browser when no listener could start', async () => {
    const start = jest.fn(() => Promise.reject(new ChatGPTAuthError('unavailable')));

    await expect(createAuthorize(start)(FIRST_REGISTRATION)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
