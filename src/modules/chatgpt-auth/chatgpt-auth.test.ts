import type { AuthorizeRequest, AuthorizeResult } from './authorize';
import { createChatGPTAuth, REFRESH_MARGIN_MS } from './chatgpt-auth';
import type { ChatGPTAuthConfig, StoredChatGPTSession } from './chatgpt-auth.types';
import type { SecretStore } from './keychain-store';
import { HOST_ID_KEY, SESSION_KEY } from './keychain-store';
import { OPENAI_AUTH_ENDPOINTS, OPENAI_ISSUER } from './openai-auth.constants';
import { serializeSession } from './stored-session';

const CLIENT_ID = 'oaiapp_test';
const CONFIG: ChatGPTAuthConfig = { clientId: CLIENT_ID, redirectUri: 'http://127.0.0.1:1455/auth/callback' };
const PLAN_SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const START_MS = 1_790_000_000_000;

const base64Url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idTokenFor = (nonce: string, overrides: Record<string, unknown> = {}) =>
  `h.${base64Url(JSON.stringify({ iss: OPENAI_ISSUER, aud: CLIENT_ID, nonce, exp: START_MS / 1000 + 3600, ...overrides }))}.s`;

const respond = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

function memoryStore(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const store: SecretStore & { items: Map<string, string> } = {
    items,
    getItemAsync: jest.fn((key: string) => Promise.resolve(items.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      items.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      items.delete(key);
      return Promise.resolve();
    }),
  };

  return store;
}

const formOf = (init: unknown) =>
  new URLSearchParams(typeof init === 'object' && init !== null && 'body' in init && typeof init.body === 'string' ? init.body : '');

type Overrides = {
  config?: ChatGPTAuthConfig;
  store?: ReturnType<typeof memoryStore>;
  authorize?: (request: AuthorizeRequest) => Promise<AuthorizeResult>;
  tokenResponse?: (grant: string, nonce: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  revokeStatus?: number;
  revoke?: () => ReturnType<typeof respond>;
};

function setup(overrides: Overrides = {}) {
  const clock = { now: START_MS };
  const store = overrides.store ?? memoryStore();
  const attempts: AuthorizeRequest[] = [];
  let issued = 0;
  const authorize = jest.fn((request: AuthorizeRequest) => {
    attempts.push(request);

    return overrides.authorize?.(request) ??
      Promise.resolve<AuthorizeResult>({ type: 'success', code: 'the-code', state: request.state, clientId: request.clientId, codeVerifier: 'the-verifier' });
  });
  const fetch = jest.fn((url: string, init: RequestInit) => {
    if (url === OPENAI_AUTH_ENDPOINTS.revocation) return overrides.revoke?.() ?? respond(overrides.revokeStatus ?? 200);

    const grant = formOf(init).get('grant_type') ?? '';
    const nonce = attempts.at(-1)?.nonce ?? '';

    if (overrides.tokenResponse) return overrides.tokenResponse(grant, nonce);

    issued += 1;
    return respond(200, {
      access_token: `access-${issued}`,
      refresh_token: `refresh-${issued}`,
      id_token: idTokenFor(nonce),
      token_type: 'Bearer',
      expires_in: 3600,
      scope: PLAN_SCOPES,
    });
  });
  let tokenCounter = 0;
  const auth = createChatGPTAuth({
    getConfig: () => overrides.config ?? CONFIG,
    store,
    fetch,
    authorize,
    randomToken: () => `random-${(tokenCounter += 1)}`,
    newHostId: () => 'urn:uuid:11111111-1111-4111-8111-111111111111',
    now: () => clock.now,
  });

  return { auth, store, fetch, authorize, clock, attempts };
}

const storedSession = (overrides: Partial<StoredChatGPTSession> = {}): StoredChatGPTSession => ({
  clientId: CLIENT_ID,
  accessToken: 'stored-access',
  refreshToken: 'stored-refresh',
  expiresAtMs: START_MS + 3_600_000,
  scopes: PLAN_SCOPES.split(' '),
  ...overrides,
});

const tokenCalls = (fetch: jest.Mock) => fetch.mock.calls.filter(([url]) => url === OPENAI_AUTH_ENDPOINTS.token);

const REVOKED = { ok: true, status: 200, json: () => Promise.resolve({}) };

/** A promise the test settles when it chooses, as when OpenAI is slow to answer. */
function held<T>() {
  let release: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });

  return { promise, release: (value: T) => release(value) };
}

/** Lets every pending promise callback run. */
const flush = async () => {
  for (let step = 0; step < 100; step += 1) await Promise.resolve();
};

describe('loading the session', () => {
  it('reads signed out when the keychain holds no session, as on a fresh install', async () => {
    const { auth } = setup();

    await auth.load();

    expect(auth.getStatus()).toBe('signed-out');
  });

  it('reads signed in when the keychain holds a session for this client', async () => {
    const { auth } = setup({ store: memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) }) });

    await auth.load();

    expect(auth.getStatus()).toBe('signed-in');
  });

  it("deletes, revokes and never uses a session another client signed in, such as a development build's", async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ clientId: 'oaiapp_owner_dev' })) });
    const { auth, fetch } = setup({ store });

    await auth.load();

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(false);
    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(tokenCalls(fetch)).toHaveLength(0);
    const revoke = fetch.mock.calls.find(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation);
    expect(Object.fromEntries(formOf(revoke?.[1]))).toMatchObject({ token: 'stored-refresh', client_id: 'oaiapp_owner_dev' });
  });

  it('reads signed out, and keeps the item, when the keychain cannot be read', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    jest.mocked(store.getItemAsync).mockRejectedValueOnce(new Error('locked'));
    const { auth } = setup({ store });

    await auth.load();

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(true);
  });

  it('reads the keychain again on the next call after a read that failed, as when the phone was locked', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    jest.mocked(store.getItemAsync).mockRejectedValueOnce(new Error('locked'));
    const { auth } = setup({ store });
    await auth.load();

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');

    expect(auth.getStatus()).toBe('signed-in');
  });
});

describe('signIn', () => {
  it("stores the signing-in user's own tokens in the keychain and reads signed in", async () => {
    const { auth, store } = setup();

    await expect(auth.signIn()).resolves.toBe('signed-in');

    expect(auth.getStatus()).toBe('signed-in');
    expect(JSON.parse(store.items.get(SESSION_KEY) ?? '{}')).toMatchObject({
      clientId: CLIENT_ID,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAtMs: START_MS + 3_600_000,
    });
  });

  it('asks for the plan scopes on the configured redirect with a fresh state and nonce per attempt', async () => {
    const { auth, attempts } = setup();

    await auth.signIn();
    await auth.signIn();

    expect(attempts[0]).toMatchObject({ clientId: CLIENT_ID, redirectUri: CONFIG.redirectUri });
    expect(attempts[0]?.scopes).toContain('chatgpt.tokens.use.direct');
    expect(attempts[1]?.state).not.toBe(attempts[0]?.state);
    expect(attempts[1]?.nonce).not.toBe(attempts[0]?.nonce);
    expect(attempts[1]?.state).not.toBe(attempts[0]?.nonce);
  });

  it('redeems the code with its verifier on the same redirect', async () => {
    const { auth, fetch } = setup();

    await auth.signIn();

    expect(Object.fromEntries(formOf(tokenCalls(fetch)[0]?.[1]))).toMatchObject({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: CONFIG.redirectUri,
    });
  });

  it('creates this install’s host id once and sends the same one on every sign-in', async () => {
    const { auth, store, attempts } = setup();

    await auth.signIn();
    await auth.signIn();

    expect(store.items.get(HOST_ID_KEY)).toBe('urn:uuid:11111111-1111-4111-8111-111111111111');
    expect(attempts.map((attempt) => attempt.hostId)).toEqual([store.items.get(HOST_ID_KEY), store.items.get(HOST_ID_KEY)]);
  });

  it("refuses with 'unavailable', and opens no browser, when the build has no client", async () => {
    const { auth, authorize } = setup({ config: { clientId: null, redirectUri: CONFIG.redirectUri } });

    await expect(auth.signIn()).rejects.toMatchObject({ name: 'ChatGPTAuthError', kind: 'unavailable' });
    expect(authorize).not.toHaveBeenCalled();
    expect(auth.getStatus()).toBe('signed-out');
  });

  it('returns to signed out, storing nothing, when the user cancels', async () => {
    const { auth, store, fetch } = setup({ authorize: () => Promise.resolve({ type: 'cancelled' }) });

    await expect(auth.signIn()).resolves.toBe('cancelled');

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a declined consent as 'denied'", async () => {
    const { auth } = setup({ authorize: () => Promise.resolve({ type: 'error', error: 'access_denied' }) });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'denied' });
    expect(auth.getStatus()).toBe('signed-out');
  });

  it.each([
    ['carries another attempt’s state', (request: AuthorizeRequest) => ({ state: `${request.state}-other` })],
    ['names another client', () => ({ clientId: 'oaiapp_other' })],
  ])("refuses a callback that %s as 'failed', redeeming nothing", async (_case, change) => {
    const { auth, fetch } = setup({
      authorize: (request) =>
        Promise.resolve({ type: 'success', code: 'c', state: request.state, clientId: request.clientId, codeVerifier: 'v', ...change(request) }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a sign-in that did not grant ChatGPT plan use, keeps nothing and revokes what it got", async () => {
    const { auth, store, fetch } = setup({
      tokenResponse: (_grant, nonce) =>
        respond(200, { access_token: 'a', refresh_token: 'identity-only-refresh', id_token: idTokenFor(nonce), expires_in: 3600, scope: 'openid profile email' }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'plan-not-allowed' });

    expect(store.items.has(SESSION_KEY)).toBe(false);
    const revoke = fetch.mock.calls.find(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation);
    expect(formOf(revoke?.[1]).get('token')).toBe('identity-only-refresh');
  });

  it('revokes what it was given when the ID token does not belong to this attempt', async () => {
    const { auth, fetch } = setup({
      tokenResponse: (_grant, nonce) =>
        respond(200, { access_token: 'a', refresh_token: 'mismatched-refresh', id_token: idTokenFor(`${nonce}-other`), expires_in: 3600, scope: PLAN_SCOPES }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });

    const revoke = fetch.mock.calls.find(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation);
    expect(formOf(revoke?.[1]).get('token')).toBe('mismatched-refresh');
  });

  it.each([
    ['an ID token for another attempt', (nonce: string) => idTokenFor(`${nonce}-other`)],
    ['an ID token for another client', (nonce: string) => idTokenFor(nonce, { aud: 'oaiapp_other' })],
    ['no ID token', () => undefined],
  ])("refuses a token response with %s as 'failed'", async (_case, idToken) => {
    const { auth, store } = setup({
      tokenResponse: (_grant, nonce) =>
        respond(200, { access_token: 'a', refresh_token: 'r', id_token: idToken(nonce), expires_in: 3600, scope: PLAN_SCOPES }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });
    expect(store.items.has(SESSION_KEY)).toBe(false);
  });

  it("refuses with 'failed', and stays signed out, when the keychain will not take the session", async () => {
    const store = memoryStore();
    jest.mocked(store.setItemAsync).mockImplementation((key) =>
      key === SESSION_KEY ? Promise.reject(new Error('errSecInteractionNotAllowed')) : Promise.resolve(),
    );
    const { auth } = setup({ store });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });
    expect(auth.getStatus()).toBe('signed-out');
  });

  it('opens one browser session for sign-in taps that arrive together', async () => {
    const { auth, authorize } = setup();

    const outcomes = await Promise.all([auth.signIn(), auth.signIn()]);

    expect(outcomes).toEqual(['signed-in', 'signed-in']);
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it('revokes what it was given when the keychain will not take the session', async () => {
    const store = memoryStore();
    jest.mocked(store.setItemAsync).mockImplementation((key) =>
      key === SESSION_KEY ? Promise.reject(new Error('errSecInteractionNotAllowed')) : Promise.resolve(),
    );
    const { auth, fetch } = setup({ store });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });

    const revoke = fetch.mock.calls.find(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation);
    expect(formOf(revoke?.[1]).get('token')).toBe('refresh-1');
  });

  it('tells subscribers it is signing in, then signed in', async () => {
    const { auth } = setup();
    await auth.load();
    const seen: string[] = [];
    auth.subscribe(() => seen.push(auth.getStatus()));

    await auth.signIn();

    expect(seen).toEqual(['signing-in', 'signed-in']);
  });
});

describe('getAccessToken', () => {
  it('returns null and calls nothing when nobody has signed in on this device', async () => {
    const { auth, fetch } = setup();

    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the stored token while it is fresh', async () => {
    const { auth, fetch } = setup({ store: memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) }) });

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes a token about to expire, stores the replacement pair and returns the new token', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS + REFRESH_MARGIN_MS - 1 })) });
    const { auth, fetch } = setup({ store });

    await expect(auth.getAccessToken()).resolves.toBe('access-1');

    expect(Object.fromEntries(formOf(tokenCalls(fetch)[0]?.[1]))).toMatchObject({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: 'stored-refresh',
    });
    expect(JSON.parse(store.items.get(SESSION_KEY) ?? '{}')).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('refreshes a token that expired while the app was closed (a forced expiry)', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS - 86_400_000 })) });
    const { auth } = setup({ store });

    await expect(auth.getAccessToken()).resolves.toBe('access-1');
  });

  it('runs one refresh for callers that arrive together, so a rotating refresh token is spent once', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS })) });
    const { auth, fetch } = setup({ store });

    const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);

    expect(tokens).toEqual(['access-1', 'access-1', 'access-1']);
    expect(tokenCalls(fetch)).toHaveLength(1);
  });

  it('signs out, deleting the keychain item, when the refresh token no longer works', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS })) });
    const { auth } = setup({ store, tokenResponse: () => respond(400, { error: 'invalid_grant' }) });

    await expect(auth.getAccessToken()).resolves.toBeNull();

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(false);
  });

  it('signs out when a refresh comes back without ChatGPT plan use, as after the user disconnects the app', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS })) });
    const { auth } = setup({ store, tokenResponse: () => respond(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'openid' }) });

    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(auth.getStatus()).toBe('signed-out');
  });

  it('revokes the refresh token issued by a refresh without ChatGPT plan use, as the session it would keep ends', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS })) });
    const { auth, fetch } = setup({
      store,
      tokenResponse: () => respond(200, { access_token: 'a', refresh_token: 'refresh-noplan', expires_in: 3600, scope: 'openid' }),
    });

    await auth.getAccessToken();
    await flush();

    const revoked = fetch.mock.calls.filter(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation).map(([, init]) => formOf(init).get('token'));
    expect(revoked).toEqual(['refresh-noplan']);
  });

  it('keeps using a token that has not expired yet when its early refresh cannot reach OpenAI', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS + 60_000 })) });
    const { auth } = setup({ store, tokenResponse: () => Promise.reject(new TypeError('Network request failed')) });

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
  });

  it('refreshes on the next call a token OpenAI refused, however long it had left', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    const { auth, fetch } = setup({ store });
    await auth.load();

    auth.rejectAccessToken('stored-access');

    await expect(auth.getAccessToken()).resolves.toBe('access-1');
    expect(tokenCalls(fetch)).toHaveLength(1);
  });

  it('ignores a refusal of a token it no longer holds', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    const { auth, fetch } = setup({ store });
    await auth.load();

    auth.rejectAccessToken('some-older-token');

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the session and throws 'network' when the refresh cannot reach OpenAI", async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS })) });
    const { auth } = setup({ store, tokenResponse: () => Promise.reject(new TypeError('Network request failed')) });

    await expect(auth.getAccessToken()).rejects.toMatchObject({ kind: 'network' });

    expect(auth.getStatus()).toBe('signed-in');
    expect(store.items.has(SESSION_KEY)).toBe(true);
  });
});

describe('signOut', () => {
  it('revokes the refresh token, then deletes every token from the keychain', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()), [HOST_ID_KEY]: 'urn:uuid:host' });
    const { auth, fetch } = setup({ store });

    await expect(auth.signOut()).resolves.toEqual({ revoked: true });

    const revoke = fetch.mock.calls.find(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation);
    expect(Object.fromEntries(formOf(revoke?.[1]))).toEqual({ token: 'stored-refresh', token_type_hint: 'refresh_token', client_id: CLIENT_ID });
    expect(auth.getStatus()).toBe('signed-out');
    expect([...store.items.keys()]).toEqual([HOST_ID_KEY]);
    expect([...store.items.values()].join('\n')).not.toMatch(/stored-access|stored-refresh/);
  });

  it('still signs this device out, and says so, when OpenAI does not confirm the revocation', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    const { auth } = setup({ store, revokeStatus: 503 });

    await expect(auth.signOut()).resolves.toEqual({ revoked: false });

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(false);
  });

  it("stays signed in and throws 'failed' when neither the revoke nor the delete went through, so sign-out can be tried again", async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    jest.mocked(store.deleteItemAsync).mockRejectedValueOnce(new Error('keychain'));
    const { auth } = setup({ store, revokeStatus: 503 });

    await expect(auth.signOut()).rejects.toMatchObject({ kind: 'failed' });
    expect(auth.getStatus()).toBe('signed-in');
  });

  it('starts no refresh while it is revoking, so no unrevoked token outlives the sign-out', async () => {
    const held = { release: () => undefined as void };
    const revokeHeld = new Promise<void>((resolve) => {
      held.release = resolve;
    });
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS })) });
    const { auth, fetch } = setup({ store, revoke: () => revokeHeld.then(() => respond(200)) });
    await auth.load();

    const signingOut = auth.signOut();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const tokenDuringSignOut = await auth.getAccessToken();
    held.release();
    await signingOut;

    expect(tokenDuringSignOut).toBeNull();
    expect(tokenCalls(fetch)).toHaveLength(0);
    expect(store.items.has(SESSION_KEY)).toBe(false);
    await expect(auth.getAccessToken()).resolves.toBeNull();
  });

  it('puts the session back, still usable, when neither OpenAI nor the keychain let go of it', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    jest.mocked(store.deleteItemAsync).mockRejectedValueOnce(new Error('keychain'));
    const { auth } = setup({ store, revokeStatus: 503 });

    await expect(auth.signOut()).rejects.toMatchObject({ kind: 'failed' });

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
  });

  it('never hands out a token OpenAI confirmed revoked, even when the keychain item cannot be deleted', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    jest.mocked(store.deleteItemAsync).mockRejectedValue(new Error('keychain'));
    const { auth } = setup({ store });

    await expect(auth.signOut()).resolves.toEqual({ revoked: true });

    expect(auth.getStatus()).toBe('signed-out');
    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(store.deleteItemAsync).toHaveBeenCalledTimes(2);
  });

  it('leaves a revoked session it could not delete unusable on the next launch too', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    jest.mocked(store.deleteItemAsync).mockRejectedValue(new Error('keychain'));
    const { auth } = setup({ store });
    await auth.signOut();

    const nextLaunch = setup({ store, tokenResponse: () => respond(400, { error: 'invalid_grant' }) });

    await expect(nextLaunch.auth.getAccessToken()).resolves.toBeNull();
    expect(nextLaunch.auth.getStatus()).toBe('signed-out');
  });

  it('waits for a sign-in in progress, then signs that account out', async () => {
    const held = { release: () => undefined as void };
    const browserHeld = new Promise<void>((resolve) => {
      held.release = resolve;
    });
    const { auth, store } = setup({
      authorize: (request) =>
        browserHeld.then(() => ({ type: 'success' as const, code: 'c', state: request.state, clientId: request.clientId, codeVerifier: 'v' })),
    });

    const signingIn = auth.signIn();
    const signingOut = auth.signOut();
    held.release();
    await signingIn;
    await signingOut;

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(false);
  });

  it('revokes once for sign-out taps that arrive together', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    const { auth, fetch } = setup({ store });

    await Promise.all([auth.signOut(), auth.signOut()]);

    expect(fetch.mock.calls.filter(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation)).toHaveLength(1);
  });

  it('keeps a sign-in made while a sign-out waits on OpenAI, in memory and in the keychain', async () => {
    const revoke = held<Awaited<ReturnType<typeof respond>>>();
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) });
    const { auth, fetch } = setup({ store, revoke: () => revoke.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const signingIn = auth.signIn();
    await flush();
    revoke.release(REVOKED);
    await signingOut;
    await signingIn;

    const revoked = fetch.mock.calls.filter(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation).map(([, init]) => formOf(init).get('token'));
    expect({ status: auth.getStatus(), keychainHasSession: store.items.has(SESSION_KEY), revoked }).toEqual({
      status: 'signed-in',
      keychainHasSession: true,
      revoked: ['stored-refresh'],
    });
  });

  it('finishes a sign-out and a sign-in asked for back to back, in that order', async () => {
    const { auth, store } = setup({ store: memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) }) });

    const both = Promise.all([auth.signOut(), auth.signIn()]);

    await expect(both).resolves.toEqual([{ revoked: true }, 'signed-in']);
    expect({ status: auth.getStatus(), keychainHasSession: store.items.has(SESSION_KEY) }).toEqual({
      status: 'signed-in',
      keychainHasSession: true,
    });
  });

  it('tells subscribers it is signing out until OpenAI and the keychain have let go', async () => {
    const revoke = held<Awaited<ReturnType<typeof respond>>>();
    const { auth } = setup({ store: memoryStore({ [SESSION_KEY]: serializeSession(storedSession()) }), revoke: () => revoke.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const whileWaiting = auth.getStatus();
    revoke.release(REVOKED);
    await signingOut;

    expect([whileWaiting, auth.getStatus()]).toEqual(['signing-out', 'signed-out']);
  });

  it('waits for a refresh in flight and revokes the refresh token it produced', async () => {
    const store = memoryStore({ [SESSION_KEY]: serializeSession(storedSession({ expiresAtMs: START_MS })) });
    const { auth, fetch } = setup({ store });

    const refreshing = auth.getAccessToken();
    await auth.signOut();
    await refreshing;

    const revoke = fetch.mock.calls.find(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation);
    expect(formOf(revoke?.[1]).get('token')).toBe('refresh-1');
    expect(store.items.has(SESSION_KEY)).toBe(false);
    await expect(auth.getAccessToken()).resolves.toBeNull();
  });
});

describe('never writes a token anywhere but the keychain', () => {
  it('logs nothing through a whole sign-in, refresh and sign-out', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => undefined));
    const { auth, clock } = setup();

    await auth.signIn();
    clock.now += 3_600_000;
    await auth.getAccessToken();
    await auth.signOut();

    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    spies.forEach((spy) => spy.mockRestore());
  });
});
