import type { AuthorizeRequest, AuthorizeResult } from './authorize';
import { ChatGPTAuthError } from './chatgpt-auth-error';
import { createChatGPTAuth, REFRESH_MARGIN_MS } from './chatgpt-auth';
import type { ChatGPTRegistration, StoredChatGPTAccounts, StoredChatGPTSession } from './chatgpt-auth.types';
import type { SecretStore } from './keychain-store';
import { HOST_ID_KEY, SESSION_KEY } from './keychain-store';
import { DYNAMIC_REGISTRATION_CLIENT_ID, OPENAI_AUTH_ENDPOINTS, OPENAI_ISSUER } from './openai-auth.constants';
import { serializeAccounts } from './stored-session';

const ISSUED_A = 'oaiapp_issued_a';
const ISSUED_B = 'oaiapp_issued_b';
const ACCOUNT_A = { sub: 'user-a', email: 'a@example.com' };
const ACCOUNT_B = { sub: 'user-b', email: 'b@example.com' };
const REGISTRATION_A: ChatGPTRegistration = { clientId: ISSUED_A, subject: 'user-a', email: 'a@example.com' };
const REGISTRATION_B: ChatGPTRegistration = { clientId: ISSUED_B, subject: 'user-b', email: 'b@example.com' };
/** The client OpenAI issues when each account registers. */
const ISSUED_FOR: Readonly<Record<string, string>> = { 'user-a': ISSUED_A, 'user-b': ISSUED_B };
// Not the preferred 1455: a listener that fell back to another port must have that port repeated in the exchange.
const REDIRECT = 'http://127.0.0.1:53662/auth/callback';
/** The first host id the fake generator makes; it makes a new one on every call. */
const HOST_ID = 'urn:uuid:host-1';
const PLAN_SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const IDENTITY_ONLY_SCOPES = 'openid profile email offline_access resource.invoke';
const START_MS = 1_790_000_000_000;

interface Account {
  readonly sub: string;
  readonly email?: string;
}

const base64Url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const idTokenFor = (nonce: string, claims: Record<string, unknown>) =>
  `h.${base64Url(JSON.stringify({ iss: OPENAI_ISSUER, nonce, exp: START_MS / 1000 + 3600, ...claims }))}.s`;

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

type TokenReply = ReturnType<typeof respond>;

interface Overrides {
  store?: ReturnType<typeof memoryStore>;
  /** Who signs in on OpenAI's page. */
  account?: Account;
  authorize?: (request: AuthorizeRequest) => Promise<AuthorizeResult>;
  tokenResponse?: (grant: string, nonce: string) => TokenReply;
  revokeStatus?: number;
  /** Called once per revocation attempt, in order. */
  revoke?: (init: RequestInit) => TokenReply;
  clearCookies?: () => Promise<void>;
}

/** OpenAI's page as the app meets it: a first registration names the client it issued; a reauthorization omits it. */
const callbackFor = (request: AuthorizeRequest, account: Account): AuthorizeResult => ({
  type: 'success',
  code: 'the-code',
  state: request.state,
  clientId: request.clientId === DYNAMIC_REGISTRATION_CLIENT_ID ? (ISSUED_FOR[account.sub] ?? 'oaiapp_issued_other') : null,
  codeVerifier: 'the-verifier',
  redirectUri: REDIRECT,
});

function setup(overrides: Overrides = {}) {
  const clock = { now: START_MS };
  const store = overrides.store ?? memoryStore();
  const signingInAs: { current: Account } = { current: overrides.account ?? ACCOUNT_A };
  const attempts: AuthorizeRequest[] = [];
  let issued = 0;
  const authorize = jest.fn((request: AuthorizeRequest) => {
    attempts.push(request);

    return overrides.authorize?.(request) ?? Promise.resolve(callbackFor(request, signingInAs.current));
  });
  const fetch = jest.fn((url: string, init: RequestInit) => {
    if (url === OPENAI_AUTH_ENDPOINTS.revocation) return overrides.revoke?.(init) ?? respond(overrides.revokeStatus ?? 200);

    const form = formOf(init);
    const grant = form.get('grant_type') ?? '';
    const nonce = attempts.at(-1)?.nonce ?? '';

    if (overrides.tokenResponse) return overrides.tokenResponse(grant, nonce);

    issued += 1;
    return respond(200, {
      access_token: `access-${issued}`,
      refresh_token: `refresh-${issued}`,
      id_token: idTokenFor(nonce, { aud: form.get('client_id'), sub: signingInAs.current.sub, email: signingInAs.current.email }),
      token_type: 'Bearer',
      expires_in: 3600,
      scope: PLAN_SCOPES,
    });
  });
  let tokenCounter = 0;
  let hostIds = 0;
  const wait = jest.fn((_ms: number) => Promise.resolve());
  const clearCookies = jest.fn(() => overrides.clearCookies?.() ?? Promise.resolve());
  const auth = createChatGPTAuth({
    store,
    fetch,
    authorize,
    wait,
    clearCookies,
    randomToken: () => `random-${(tokenCounter += 1)}`,
    newHostId: () => `urn:uuid:host-${(hostIds += 1)}`,
    now: () => clock.now,
  });

  return { auth, store, fetch, authorize, clock, attempts, signingInAs, wait, clearCookies };
}

const storedSession = (overrides: Partial<StoredChatGPTSession> = {}): StoredChatGPTSession => ({
  clientId: ISSUED_A,
  subject: 'user-a',
  accessToken: 'stored-access',
  refreshToken: 'stored-refresh',
  expiresAtMs: START_MS + 3_600_000,
  scopes: PLAN_SCOPES.split(' '),
  ...overrides,
});

const accountsItem = (overrides: Partial<StoredChatGPTAccounts> = {}) =>
  serializeAccounts({ registrations: [REGISTRATION_A], lastSubject: 'user-a', session: storedSession(), ...overrides });

/** A phone where account A is signed in, its session changed by `session`. */
const signedInStore = (session: Partial<StoredChatGPTSession> = {}) =>
  memoryStore({ [SESSION_KEY]: accountsItem({ session: storedSession(session) }) });

/** A phone where account A registered and then signed out. */
const signedOutStore = (accounts: Partial<StoredChatGPTAccounts> = {}) =>
  memoryStore({ [SESSION_KEY]: accountsItem({ session: null, ...accounts }) });

const itemOf = (store: ReturnType<typeof memoryStore>): unknown => JSON.parse(store.items.get(SESSION_KEY) ?? 'null');

const tokenCalls = (fetch: jest.Mock) => fetch.mock.calls.filter(([url]) => url === OPENAI_AUTH_ENDPOINTS.token);

const revocations = (fetch: jest.Mock) =>
  fetch.mock.calls.filter(([url]) => url === OPENAI_AUTH_ENDPOINTS.revocation).map(([, init]) => Object.fromEntries(formOf(init)));

const REVOKED = { ok: true, status: 200, json: () => Promise.resolve({}) };

/** A token response for an account and the client it was issued to (account A's by default), with or without plan use. */
const planTokens = (nonce: string, planUse: boolean, as: { account: Account; client: string } = { account: ACCOUNT_A, client: ISSUED_A }) =>
  respond(200, {
    access_token: 'a',
    refresh_token: planUse ? 'refresh-plan' : 'refresh-identity-only',
    id_token: idTokenFor(nonce, { aud: as.client, sub: as.account.sub, email: as.account.email }),
    token_type: 'Bearer',
    expires_in: 3600,
    scope: planUse ? PLAN_SCOPES : IDENTITY_ONLY_SCOPES,
  });

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
  it('reads signed out with no saved account when the keychain is empty, as on a fresh install', async () => {
    const { auth } = setup();

    await auth.load();

    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-out', false]);
  });

  it('reads signed in when the keychain holds a session for a registered account', async () => {
    const { auth } = setup({ store: signedInStore() });

    await auth.load();

    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-in', true]);
  });

  it('reads signed out with a saved account when that account signed out', async () => {
    const { auth } = setup({ store: signedOutStore() });

    await auth.load();

    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-out', true]);
  });

  it('ends at OpenAI and deletes a version-1 session of the app-wide client this build no longer has', async () => {
    const legacy = JSON.stringify({ version: 1, clientId: 'oaiapp_app_wide', accessToken: 'old-access', refreshToken: 'old-refresh', expiresAtMs: START_MS + 3_600_000, scopes: PLAN_SCOPES.split(' ') });
    const store = memoryStore({ [SESSION_KEY]: legacy });
    const { auth, fetch } = setup({ store });

    await auth.load();

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(false);
    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(tokenCalls(fetch)).toHaveLength(0);
    expect(revocations(fetch)).toEqual([{ token: 'old-refresh', token_type_hint: 'refresh_token', client_id: 'oaiapp_app_wide' }]);
  });

  it('reads signed out, and keeps the item, when the keychain cannot be read', async () => {
    const store = signedInStore();
    jest.mocked(store.getItemAsync).mockRejectedValueOnce(new Error('locked'));
    const { auth } = setup({ store });

    await auth.load();

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(true);
  });

  it('clears OpenAI’s cookies on a launch that finds nobody signed in, finishing a sign-out the app was quit during (qa f-12d58b)', async () => {
    const store = signedInStore();
    const quit = setup({ store, revoke: () => new Promise<never>(() => undefined) });
    await quit.auth.load();
    void quit.auth.signOut();
    await flush();

    const relaunch = setup({ store });
    await relaunch.auth.load();
    await flush();

    expect([quit.clearCookies.mock.calls.length, relaunch.auth.getStatus(), relaunch.clearCookies.mock.calls.length]).toEqual([0, 'signed-out', 1]);
  });

  it('clears no cookie on a launch that finds the user signed in', async () => {
    const { auth, clearCookies } = setup({ store: signedInStore() });

    await auth.load();
    await flush();

    expect(clearCookies).not.toHaveBeenCalled();
  });

  it('clears no cookie on a launch that cannot read the keychain, since it cannot tell whether anyone is signed in', async () => {
    const store = signedInStore();
    jest.mocked(store.getItemAsync).mockRejectedValueOnce(new Error('locked'));
    const { auth, clearCookies } = setup({ store });

    await auth.load();
    await flush();

    expect(clearCookies).not.toHaveBeenCalled();
  });

  it('still reads signed out when the cookies will not clear at launch', async () => {
    const { auth } = setup({ store: signedOutStore(), clearCookies: () => Promise.reject(new Error('cookie store')) });

    await auth.load();
    await flush();

    expect(auth.getStatus()).toBe('signed-out');
  });

  it('reads the keychain again on the next call after a read that failed, as when the phone was locked', async () => {
    const store = signedInStore();
    jest.mocked(store.getItemAsync).mockRejectedValueOnce(new Error('locked'));
    const { auth } = setup({ store });
    await auth.load();

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');

    expect(auth.getStatus()).toBe('signed-in');
  });
});

describe('signIn: the first account on this phone', () => {
  it('registers through dynamic_agent_client with the app’s name and this install’s host id', async () => {
    const { auth, attempts } = setup();

    await auth.signIn();

    expect(attempts[0]).toMatchObject({
      clientId: 'dynamic_agent_client',
      agentNameHint: 'Just Calorie',
      loginHint: null,
      hostId: HOST_ID,
    });
    expect(attempts[0]?.scopes).toContain('chatgpt.tokens.use.direct');
  });

  it('redeems the code with the client OpenAI issued, its verifier and the same loopback redirect', async () => {
    const { auth, fetch } = setup();

    await auth.signIn();

    expect(Object.fromEntries(formOf(tokenCalls(fetch)[0]?.[1]))).toMatchObject({
      grant_type: 'authorization_code',
      client_id: ISSUED_A,
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: REDIRECT,
    });
  });

  it('keeps the issued client, the account and its tokens in the one keychain item, and reads signed in', async () => {
    const { auth, store } = setup();

    await expect(auth.signIn()).resolves.toBe('signed-in');

    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-in', true]);
    expect(itemOf(store)).toEqual({
      version: 2,
      registrations: [REGISTRATION_A],
      lastSubject: 'user-a',
      session: storedSession({ accessToken: 'access-1', refreshToken: 'refresh-1' }),
    });
    expect([...store.items.keys()].sort()).toEqual([HOST_ID_KEY, SESSION_KEY].sort());
  });

  it('asks with a fresh state and nonce per attempt', async () => {
    const { auth, attempts } = setup();

    await auth.signIn();
    await auth.signIn({ newAccount: true });

    expect(attempts[1]?.state).not.toBe(attempts[0]?.state);
    expect(attempts[1]?.nonce).not.toBe(attempts[0]?.nonce);
    expect(attempts[1]?.state).not.toBe(attempts[0]?.nonce);
  });

  it('creates this install’s host id once and sends the same one on every sign-in', async () => {
    const { auth, store, attempts } = setup();

    await auth.signIn();
    await auth.signOut();
    await auth.signIn();

    expect(store.items.get(HOST_ID_KEY)).toBe(HOST_ID);
    expect(attempts.map((attempt) => attempt.hostId)).toEqual([HOST_ID, HOST_ID]);
    expect(jest.mocked(store.setItemAsync).mock.calls.filter(([key]) => key === HOST_ID_KEY)).toHaveLength(1);
  });

  it.each([
    ['names no issued client', null],
    ['names dynamic_agent_client as its client', 'dynamic_agent_client'],
  ])("refuses a registration whose callback %s as 'failed', redeeming and keeping nothing", async (_case, named) => {
    const { auth, store, fetch } = setup({
      authorize: (request) => Promise.resolve({ ...callbackFor(request, ACCOUNT_A), clientId: named }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });

    expect(fetch).not.toHaveBeenCalled();
    expect(store.items.has(SESSION_KEY)).toBe(false);
  });

  it("passes on 'unavailable' from a build that has no callback listener, keeping nothing", async () => {
    const { auth, store } = setup({ authorize: () => Promise.reject(new ChatGPTAuthError('unavailable')) });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'unavailable' });

    expect(auth.getStatus()).toBe('signed-out');
    expect(store.items.has(SESSION_KEY)).toBe(false);
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

  it("reads a listener that timed out as 'failed'", async () => {
    const { auth } = setup({ authorize: () => Promise.resolve({ type: 'error', error: 'callback_timeout' }) });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });
  });

  it("refuses a callback that carries another attempt’s state as 'failed', redeeming nothing", async () => {
    const { auth, fetch } = setup({
      authorize: (request) => Promise.resolve({ ...callbackFor(request, ACCOUNT_A), state: `${request.state}-other` }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a registration that did not grant ChatGPT plan use, revokes what it got, and keeps only its client, marked declined', async () => {
    const { auth, store, fetch } = setup({
      tokenResponse: (_grant, nonce) =>
        respond(200, { access_token: 'a', refresh_token: 'identity-only-refresh', id_token: idTokenFor(nonce, { aud: ISSUED_A, sub: 'user-a', email: 'a@example.com' }), expires_in: 3600, scope: IDENTITY_ONLY_SCOPES }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'plan-not-allowed' });

    expect(itemOf(store)).toEqual({ version: 2, registrations: [{ ...REGISTRATION_A, planDeclined: true }], lastSubject: 'user-a', session: null });
    expect(revocations(fetch)).toEqual([{ token: 'identity-only-refresh', token_type_hint: 'refresh_token', client_id: ISSUED_A }]);
    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-out', true]);
  });

  it('asks again with the same client, the full scopes and prompt=consent after a decline, and clears the mark once granted (qa f-101636)', async () => {
    const grant = { planUse: false };
    const { auth, store, attempts } = setup({ tokenResponse: (_grant, nonce) => planTokens(nonce, grant.planUse) });
    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'plan-not-allowed' });
    grant.planUse = true;

    await expect(auth.signIn()).resolves.toBe('signed-in');

    expect(attempts.map((attempt) => [attempt.clientId, attempt.prompt])).toEqual([
      ['dynamic_agent_client', null],
      [ISSUED_A, 'consent'],
    ]);
    expect(attempts[1]?.scopes).toContain('chatgpt.tokens.use.direct');
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { clientId: ISSUED_A } });
  });

  it('refuses another account answering a saved account’s sign-in without plan use, saving nothing for it (qa f-24dac4)', async () => {
    const store = signedOutStore();
    const before = store.items.get(SESSION_KEY);
    const { auth } = setup({ store, account: ACCOUNT_B, tokenResponse: (_grant, nonce) => planTokens(nonce, false, { account: ACCOUNT_B, client: ISSUED_A }) });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'another-account' });

    expect(store.items.get(SESSION_KEY)).toBe(before);
  });

  it('makes a second account that declines the one the next Continue asks again, with consent (qa f-24dac4)', async () => {
    const grant = { planUse: false };
    const store = signedOutStore();
    const { auth, attempts } = setup({
      store,
      account: ACCOUNT_B,
      tokenResponse: (_grant, nonce) => planTokens(nonce, grant.planUse, { account: ACCOUNT_B, client: ISSUED_B }),
    });
    await expect(auth.signIn({ newAccount: true })).rejects.toMatchObject({ kind: 'plan-not-allowed' });
    grant.planUse = true;

    await auth.signIn();

    expect(attempts[1]).toMatchObject({ clientId: ISSUED_B, prompt: 'consent' });
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A, REGISTRATION_B], lastSubject: 'user-b' });
  });

  it('marks a saved account that declines plan use on a later sign-in, keeping its client', async () => {
    const store = signedOutStore();
    const { auth } = setup({ store, tokenResponse: (_grant, nonce) => planTokens(nonce, false) });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'plan-not-allowed' });

    expect(itemOf(store)).toMatchObject({ registrations: [{ ...REGISTRATION_A, planDeclined: true }], session: null });
  });

  it.each([
    ['an ID token for another attempt', (nonce: string) => idTokenFor(`${nonce}-other`, { aud: ISSUED_A, sub: 'user-a' })],
    ['an ID token for another client', (nonce: string) => idTokenFor(nonce, { aud: 'oaiapp_other', sub: 'user-a' })],
    ['an ID token with no account', (nonce: string) => idTokenFor(nonce, { aud: ISSUED_A })],
    ['no ID token', () => undefined],
  ])("refuses a token response with %s as 'failed', keeping nothing and revoking what it got", async (_case, idToken) => {
    const { auth, store, fetch } = setup({
      tokenResponse: (_grant, nonce) =>
        respond(200, { access_token: 'a', refresh_token: 'mismatched-refresh', id_token: idToken(nonce), expires_in: 3600, scope: PLAN_SCOPES }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });

    expect(store.items.has(SESSION_KEY)).toBe(false);
    expect(revocations(fetch).map((form) => form.token)).toEqual(['mismatched-refresh']);
  });

  it("refuses with 'failed', stays signed out and revokes what it got, when the keychain will not take the session", async () => {
    const store = memoryStore();
    jest.mocked(store.setItemAsync).mockImplementation((key) =>
      key === SESSION_KEY ? Promise.reject(new Error('errSecInteractionNotAllowed')) : Promise.resolve(),
    );
    const { auth, fetch } = setup({ store });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });

    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-out', false]);
    expect(revocations(fetch).map((form) => form.token)).toEqual(['refresh-1']);
  });

  it('opens one browser session for sign-in taps that arrive together', async () => {
    const { auth, authorize } = setup();

    const outcomes = await Promise.all([auth.signIn(), auth.signIn()]);

    expect(outcomes).toEqual(['signed-in', 'signed-in']);
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it('tells subscribers it is signing in, that the account is saved once it registers, then signed in', async () => {
    const { auth } = setup();
    await auth.load();
    const seen: [string, boolean][] = [];
    auth.subscribe(() => seen.push([auth.getStatus(), auth.hasSavedAccount()]));

    await auth.signIn();

    expect(seen).toEqual([
      ['signing-in', false],
      ['signing-in', true],
      ['signed-in', true],
    ]);
  });
});

describe('signIn: a saved account', () => {
  it('signs in again with its own client, no agent name and its email as the login hint, registering nothing', async () => {
    const { auth, store, fetch, attempts } = setup({ store: signedOutStore() });

    await expect(auth.signIn()).resolves.toBe('signed-in');

    expect(attempts[0]).toMatchObject({ clientId: ISSUED_A, agentNameHint: null, loginHint: 'a@example.com', hostId: HOST_ID, prompt: null });
    expect(formOf(tokenCalls(fetch)[0]?.[1]).get('client_id')).toBe(ISSUED_A);
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { clientId: ISSUED_A, accessToken: 'access-1' } });
  });

  it('accepts a callback that names the account’s own client', async () => {
    const { auth } = setup({
      store: signedOutStore(),
      authorize: (request) => Promise.resolve({ ...callbackFor(request, ACCOUNT_A), clientId: ISSUED_A }),
    });

    await expect(auth.signIn()).resolves.toBe('signed-in');
  });

  it("refuses a callback that names another client as 'another-account', redeeming nothing", async () => {
    const { auth, fetch } = setup({
      store: signedOutStore(),
      authorize: (request) => Promise.resolve({ ...callbackFor(request, ACCOUNT_A), clientId: ISSUED_B }),
    });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'another-account' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('replaces nothing, and revokes what it got, when another ChatGPT account answers the saved account’s sign-in', async () => {
    const store = signedOutStore();
    const before = store.items.get(SESSION_KEY);
    const { auth, fetch } = setup({ store, account: ACCOUNT_B });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'another-account' });

    expect(store.items.get(SESSION_KEY)).toBe(before);
    expect(revocations(fetch)).toEqual([{ token: 'refresh-1', token_type_hint: 'refresh_token', client_id: ISSUED_A }]);
    expect(auth.getStatus()).toBe('signed-out');
  });

  it('registers another ChatGPT account with its own client, keeping the first account’s registration apart', async () => {
    const { auth, store, attempts } = setup({ store: signedOutStore(), account: ACCOUNT_B });

    await expect(auth.signIn({ newAccount: true })).resolves.toBe('signed-in');

    expect(attempts[0]).toMatchObject({ clientId: 'dynamic_agent_client', agentNameHint: 'Just Calorie', loginHint: null });
    expect(itemOf(store)).toEqual({
      version: 2,
      registrations: [REGISTRATION_A, REGISTRATION_B],
      lastSubject: 'user-b',
      session: storedSession({ clientId: ISSUED_B, subject: 'user-b', accessToken: 'access-1', refreshToken: 'refresh-1' }),
    });
  });

  it('reuses the account signed in last, and never pairs one account’s tokens with another’s client', async () => {
    const { auth, store, attempts, signingInAs } = setup({ store: signedOutStore(), account: ACCOUNT_B });
    await auth.signIn({ newAccount: true });
    await auth.signOut();

    await auth.signIn();

    expect(attempts[1]).toMatchObject({ clientId: ISSUED_B, loginHint: 'b@example.com', agentNameHint: null });
    signingInAs.current = ACCOUNT_A;
    await auth.signOut();
    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'another-account' });
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A, REGISTRATION_B], lastSubject: 'user-b', session: null });
  });

  it('drops a saved client OpenAI calls invalid at the exchange, so the next Continue registers anew', async () => {
    const store = signedOutStore();
    const refusing = setup({ store, tokenResponse: () => respond(401, { error: 'invalid_client' }) });
    await expect(refusing.auth.signIn()).rejects.toMatchObject({ kind: 'failed' });
    const retry = setup({ store });

    await retry.auth.signIn();

    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { clientId: ISSUED_A } });
    expect(retry.attempts[0]).toMatchObject({ clientId: 'dynamic_agent_client', agentNameHint: 'Just Calorie' });
  });

  it('drops only the account whose client OpenAI calls invalid, keeping every other account’s registration (qa f-8678db)', async () => {
    const store = signedOutStore({ registrations: [REGISTRATION_B, REGISTRATION_A], lastSubject: 'user-a' });
    const { auth } = setup({ store, tokenResponse: () => respond(401, { error: 'invalid_client' }) });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });

    expect(itemOf(store)).toEqual({ version: 2, registrations: [REGISTRATION_B], lastSubject: null, session: null });
  });

  it('keeps a saved client OpenAI refused for another reason, such as a spent code', async () => {
    const store = signedOutStore();
    const before = store.items.get(SESSION_KEY);
    const { auth } = setup({ store, tokenResponse: () => respond(400, { error: 'invalid_grant' }) });

    await expect(auth.signIn()).rejects.toMatchObject({ kind: 'failed' });

    expect(store.items.get(SESSION_KEY)).toBe(before);
  });

  it('replaces an account’s client when that account registers again', async () => {
    const store = signedOutStore({ registrations: [{ ...REGISTRATION_A, clientId: 'oaiapp_old_a' }] });
    const { auth } = setup({ store });

    await auth.signIn({ newAccount: true });

    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { clientId: ISSUED_A, subject: 'user-a' } });
  });
});

describe('two installs', () => {
  it('each register their own client for their own account and hold nothing of the other’s', async () => {
    const first = setup({ account: ACCOUNT_A });
    const second = setup({ account: ACCOUNT_B });

    await Promise.all([first.auth.signIn(), second.auth.signIn()]);

    expect(itemOf(first.store)).toMatchObject({ registrations: [REGISTRATION_A], session: { clientId: ISSUED_A, subject: 'user-a' } });
    expect(itemOf(second.store)).toMatchObject({ registrations: [REGISTRATION_B], session: { clientId: ISSUED_B, subject: 'user-b' } });
    expect(first.store.items.get(SESSION_KEY)).not.toContain(ISSUED_B);
    expect(second.store.items.get(SESSION_KEY)).not.toContain(ISSUED_A);
  });
});

describe('getAccessToken', () => {
  it('returns null and calls nothing when nobody has signed in on this device', async () => {
    const { auth, fetch } = setup();

    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the stored token while it is fresh', async () => {
    const { auth, fetch } = setup({ store: signedInStore() });

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes a token about to expire with the issued client, stores the replacement pair and returns the new token', async () => {
    const store = signedInStore({ expiresAtMs: START_MS + REFRESH_MARGIN_MS - 1 });
    const { auth, fetch } = setup({ store });

    await expect(auth.getAccessToken()).resolves.toBe('access-1');

    expect(Object.fromEntries(formOf(tokenCalls(fetch)[0]?.[1]))).toMatchObject({
      grant_type: 'refresh_token',
      client_id: ISSUED_A,
      refresh_token: 'stored-refresh',
    });
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { accessToken: 'access-1', refreshToken: 'refresh-1' } });
  });

  it('refreshes a token that expired while the app was closed (a forced expiry)', async () => {
    const { auth } = setup({ store: signedInStore({ expiresAtMs: START_MS - 86_400_000 }) });

    await expect(auth.getAccessToken()).resolves.toBe('access-1');
  });

  it('runs one refresh for callers that arrive together, so a rotating refresh token is spent once', async () => {
    const { auth, fetch } = setup({ store: signedInStore({ expiresAtMs: START_MS }) });

    const tokens = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);

    expect(tokens).toEqual(['access-1', 'access-1', 'access-1']);
    expect(tokenCalls(fetch)).toHaveLength(1);
  });

  it('clears the tokens but keeps the account’s client when the refresh token no longer works', async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth } = setup({ store, tokenResponse: () => respond(400, { error: 'invalid_grant' }) });

    await expect(auth.getAccessToken()).resolves.toBeNull();

    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-out', true]);
    expect(itemOf(store)).toEqual({ version: 2, registrations: [REGISTRATION_A], lastSubject: 'user-a', session: null });
  });

  it('reauthorizes with the saved client after OpenAI ended the refresh, registering nothing new', async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const ended = setup({ store, tokenResponse: () => respond(400, { error: 'invalid_grant' }) });
    await ended.auth.getAccessToken();
    const nextLaunch = setup({ store });

    await nextLaunch.auth.signIn();

    expect(nextLaunch.attempts[0]).toMatchObject({ clientId: ISSUED_A, agentNameHint: null });
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { clientId: ISSUED_A } });
  });

  it('drops the account’s client when OpenAI calls it invalid on a refresh, so the next Continue registers anew', async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth } = setup({ store, tokenResponse: () => respond(401, { error: 'invalid_client' }) });

    await expect(auth.getAccessToken()).resolves.toBeNull();

    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-out', false]);
    expect(itemOf(store)).toEqual({ version: 2, registrations: [], lastSubject: null, session: null });
  });

  it('signs out, keeping the account’s client, when a refresh comes back without ChatGPT plan use', async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth } = setup({ store, tokenResponse: () => respond(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'openid' }) });

    await expect(auth.getAccessToken()).resolves.toBeNull();

    expect(auth.getStatus()).toBe('signed-out');
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: null });
  });

  it('marks the account declined when a refresh comes back without plan use, so the next Continue asks for consent (qa f-39f149)', async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth, attempts } = setup({
      store,
      tokenResponse: (grant, nonce) =>
        grant === 'refresh_token'
          ? respond(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: IDENTITY_ONLY_SCOPES })
          : planTokens(nonce, true),
    });
    await auth.getAccessToken();

    await auth.signIn();

    expect(attempts.map((attempt) => attempt.prompt)).toEqual(['consent']);
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { clientId: ISSUED_A } });
  });

  it('revokes the refresh token issued by a refresh without ChatGPT plan use, as the session it would keep ends', async () => {
    const { auth, fetch } = setup({
      store: signedInStore({ expiresAtMs: START_MS }),
      tokenResponse: () => respond(200, { access_token: 'a', refresh_token: 'refresh-noplan', expires_in: 3600, scope: 'openid' }),
    });

    await auth.getAccessToken();
    await flush();

    expect(revocations(fetch)).toEqual([{ token: 'refresh-noplan', token_type_hint: 'refresh_token', client_id: ISSUED_A }]);
  });

  it('keeps using a token that has not expired yet when its early refresh cannot reach OpenAI', async () => {
    const { auth } = setup({ store: signedInStore({ expiresAtMs: START_MS + 60_000 }), tokenResponse: () => Promise.reject(new TypeError('Network request failed')) });

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
  });

  it('refreshes on the next call a token OpenAI refused, however long it had left', async () => {
    const { auth, fetch } = setup({ store: signedInStore() });
    await auth.load();

    auth.rejectAccessToken('stored-access');

    await expect(auth.getAccessToken()).resolves.toBe('access-1');
    expect(tokenCalls(fetch)).toHaveLength(1);
  });

  it('ignores a refusal of a token it no longer holds', async () => {
    const { auth, fetch } = setup({ store: signedInStore() });
    await auth.load();

    auth.rejectAccessToken('some-older-token');

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('revokes, and never stores, the pair a refresh brings back after a sign-in replaced its session', async () => {
    const refreshReply = held<Awaited<TokenReply>>();
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth, fetch } = setup({
      store,
      tokenResponse: (grant, nonce) =>
        grant === 'refresh_token'
          ? refreshReply.promise
          : respond(200, {
              access_token: 'access-signin',
              refresh_token: 'refresh-signin',
              id_token: idTokenFor(nonce, { aud: ISSUED_A, sub: 'user-a', email: 'a@example.com' }),
              token_type: 'Bearer',
              expires_in: 3600,
              scope: PLAN_SCOPES,
            }),
    });
    const refreshing = auth.getAccessToken();
    await flush();
    await auth.signIn();

    refreshReply.release(await respond(200, { access_token: 'access-late', refresh_token: 'refresh-late', expires_in: 3600, scope: PLAN_SCOPES }));
    await refreshing;
    await flush();

    expect(revocations(fetch).map((form) => form.token)).toContain('refresh-late');
    expect(jest.mocked(store.setItemAsync).mock.calls.some(([, value]) => value.includes('refresh-late'))).toBe(false);
    expect(itemOf(store)).toMatchObject({ session: { accessToken: 'access-signin', refreshToken: 'refresh-signin' } });
  });

  it("never reads a 5xx as an invalid client, even one naming invalid_client: 'network', and the client is kept (qa f-8678db)", async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth } = setup({ store, tokenResponse: () => respond(503, { error: 'invalid_client' }) });

    await expect(auth.getAccessToken()).rejects.toMatchObject({ kind: 'network' });

    expect(auth.getStatus()).toBe('signed-in');
    expect(itemOf(store)).toMatchObject({ registrations: [REGISTRATION_A], session: { refreshToken: 'stored-refresh' } });
  });

  it("keeps the session and throws 'network' when the refresh cannot reach OpenAI", async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth } = setup({ store, tokenResponse: () => Promise.reject(new TypeError('Network request failed')) });

    await expect(auth.getAccessToken()).rejects.toMatchObject({ kind: 'network' });

    expect(auth.getStatus()).toBe('signed-in');
    expect(itemOf(store)).toMatchObject({ session: { refreshToken: 'stored-refresh' } });
  });
});

describe('signOut', () => {
  it('revokes with the issued client, clears every token, and keeps the account’s client and the host id', async () => {
    const store = signedInStore();
    store.items.set(HOST_ID_KEY, HOST_ID);
    const { auth, fetch } = setup({ store });

    await expect(auth.signOut()).resolves.toEqual({ revoked: true });

    expect(revocations(fetch)).toEqual([{ token: 'stored-refresh', token_type_hint: 'refresh_token', client_id: ISSUED_A }]);
    expect([auth.getStatus(), auth.hasSavedAccount()]).toEqual(['signed-out', true]);
    expect(itemOf(store)).toEqual({ version: 2, registrations: [REGISTRATION_A], lastSubject: 'user-a', session: null });
    expect(store.items.get(HOST_ID_KEY)).toBe(HOST_ID);
    expect([...store.items.values()].join('\n')).not.toMatch(/stored-access|stored-refresh/);
  });

  it('clears OpenAI’s and ChatGPT’s cookies once the revocation has ended, so the cookies it set go too (backlog 17)', async () => {
    const revoke = held<Awaited<TokenReply>>();
    const { auth, clearCookies } = setup({ store: signedInStore(), revoke: () => revoke.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const clearedWhileRevoking = clearCookies.mock.calls.length;
    revoke.release(REVOKED);
    await signingOut;

    expect([clearedWhileRevoking, clearCookies.mock.calls.length]).toEqual([0, 1]);
  });

  it('clears the cookies when OpenAI does not confirm the revocation too', async () => {
    const { auth, clearCookies } = setup({ store: signedInStore(), revokeStatus: 503 });

    await expect(auth.signOut()).resolves.toEqual({ revoked: false });

    expect(clearCookies).toHaveBeenCalledTimes(1);
  });

  it('stays signing out until the cookies are cleared, and starts a sign-in asked for meanwhile only after them', async () => {
    const clearing = held<undefined>();
    const { auth, authorize, clearCookies } = setup({ store: signedInStore(), clearCookies: () => clearing.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const statusWhileClearing = auth.getStatus();
    const signingIn = auth.signIn();
    await flush();
    const authorizedWhileClearing = authorize.mock.calls.length;
    clearing.release(undefined);
    await Promise.all([signingOut, signingIn]);

    expect([statusWhileClearing, authorizedWhileClearing, clearCookies.mock.calls.length]).toEqual(['signing-out', 0, 1]);
    expect(auth.getStatus()).toBe('signed-in');
  });

  it('still signs out, with the usual outcome, when the cookies will not clear', async () => {
    const store = signedInStore();
    const { auth } = setup({ store, clearCookies: () => Promise.reject(new Error('cookie store')) });

    await expect(auth.signOut()).resolves.toEqual({ revoked: true });

    expect(auth.getStatus()).toBe('signed-out');
    expect(itemOf(store)).toMatchObject({ session: null });
  });

  it('lets the same account sign in again with its client, creating no new one', async () => {
    const { auth, attempts } = setup({ store: signedInStore() });
    await auth.signOut();

    await auth.signIn();

    expect(attempts.map((attempt) => attempt.clientId)).toEqual([ISSUED_A]);
    expect(attempts[0]).toMatchObject({ agentNameHint: null, loginHint: 'a@example.com' });
  });

  it('still signs this device out, and says so, when OpenAI does not confirm the revocation', async () => {
    const store = signedInStore();
    const { auth } = setup({ store, revokeStatus: 503 });

    await expect(auth.signOut()).resolves.toEqual({ revoked: false });

    expect(auth.getStatus()).toBe('signed-out');
    expect(itemOf(store)).toMatchObject({ session: null });
  });

  it('retries a revocation OpenAI could not answer after 1 s and then 2 s, and confirms it when a retry lands', async () => {
    const replies = [() => respond(503), () => Promise.reject(new TypeError('Network request failed')), () => respond(200)];
    const { auth, fetch, wait } = setup({ store: signedInStore(), revoke: () => (replies.shift() ?? (() => respond(200)))() });

    await expect(auth.signOut()).resolves.toEqual({ revoked: true });

    expect(revocations(fetch)).toHaveLength(3);
    expect(wait.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it('stops after three attempts OpenAI could not answer, signed out and saying so', async () => {
    const store = signedInStore();
    const { auth, fetch, wait } = setup({ store, revokeStatus: 503 });

    await expect(auth.signOut()).resolves.toEqual({ revoked: false });

    expect(revocations(fetch)).toHaveLength(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(itemOf(store)).toMatchObject({ session: null });
  });

  it('does not retry a revocation OpenAI refused', async () => {
    const { auth, fetch, wait } = setup({ store: signedInStore(), revokeStatus: 400 });

    await expect(auth.signOut()).resolves.toEqual({ revoked: false });

    expect(revocations(fetch)).toHaveLength(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('clears the tokens from the keychain before it revokes, so a relaunch mid-revocation finds none (qa f-3d8e7d)', async () => {
    const revoke = held<Awaited<TokenReply>>();
    const store = signedInStore();
    const { auth } = setup({ store, revoke: () => revoke.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const relaunch = setup({ store });
    const tokenAfterRelaunch = await relaunch.auth.getAccessToken();
    revoke.release(REVOKED);
    await signingOut;

    expect(tokenAfterRelaunch).toBeNull();
    expect(itemOf(store)).toEqual({ version: 2, registrations: [REGISTRATION_A], lastSubject: 'user-a', session: null });
  });

  it('gives up on a revocation that hangs within 15 s, signed out and saying so (qa f-3d8e7d)', async () => {
    jest.useFakeTimers();
    const hanging = (init: RequestInit) =>
      new Promise<never>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('Aborted'))));
    const { auth, fetch } = setup({ store: signedInStore(), revoke: hanging });
    await auth.load();

    const signingOut = auth.signOut();
    let outcome: unknown = 'still signing out';
    void signingOut.then((settled) => (outcome = settled));
    await jest.advanceTimersByTimeAsync(15_000);
    jest.useRealTimers();

    expect(outcome).toEqual({ revoked: false });
    expect(revocations(fetch)).toHaveLength(3);
    expect(auth.getStatus()).toBe('signed-out');
  });

  it('stays signing out while it retries', async () => {
    const pause = held<undefined>();
    const { auth, wait } = setup({ store: signedInStore(), revokeStatus: 503 });
    wait.mockImplementationOnce(() => pause.promise);
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const whileWaiting = auth.getStatus();
    pause.release(undefined);
    await signingOut;

    expect([whileWaiting, auth.getStatus()]).toEqual(['signing-out', 'signed-out']);
  });

  it("stays signed in and throws 'failed' when neither the revoke nor the keychain write went through, so sign-out can be tried again", async () => {
    const store = signedInStore();
    jest.mocked(store.setItemAsync).mockRejectedValueOnce(new Error('keychain'));
    const { auth } = setup({ store, revokeStatus: 503 });

    await expect(auth.signOut()).rejects.toMatchObject({ kind: 'failed' });
    expect(auth.getStatus()).toBe('signed-in');
  });

  it('starts no refresh while it is revoking, so no unrevoked token outlives the sign-out', async () => {
    const revoke = held<Awaited<TokenReply>>();
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth, fetch } = setup({ store, revoke: () => revoke.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const tokenDuringSignOut = await auth.getAccessToken();
    revoke.release(REVOKED);
    await signingOut;

    expect(tokenDuringSignOut).toBeNull();
    expect(tokenCalls(fetch)).toHaveLength(0);
    expect(itemOf(store)).toMatchObject({ session: null });
    await expect(auth.getAccessToken()).resolves.toBeNull();
  });

  it('puts the session back, still usable, when neither OpenAI nor the keychain let go of it', async () => {
    const store = signedInStore();
    jest.mocked(store.setItemAsync).mockRejectedValueOnce(new Error('keychain'));
    const { auth } = setup({ store, revokeStatus: 503 });

    await expect(auth.signOut()).rejects.toMatchObject({ kind: 'failed' });

    await expect(auth.getAccessToken()).resolves.toBe('stored-access');
  });

  it('never hands out a token OpenAI confirmed revoked, deleting the item when the keychain will not take the signed-out one', async () => {
    const store = signedInStore();
    jest.mocked(store.setItemAsync).mockRejectedValue(new Error('keychain'));
    const { auth } = setup({ store });

    await expect(auth.signOut()).resolves.toEqual({ revoked: true });

    expect(auth.getStatus()).toBe('signed-out');
    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(store.setItemAsync).toHaveBeenCalledTimes(2);
    expect(store.items.has(SESSION_KEY)).toBe(false);
  });

  it('leaves a revoked session it could neither clear nor delete unusable on the next launch too', async () => {
    const store = signedInStore();
    jest.mocked(store.setItemAsync).mockImplementation((key, value) => {
      if (key === SESSION_KEY && JSON.parse(value).session === null) return Promise.reject(new Error('keychain'));
      store.items.set(key, value);
      return Promise.resolve();
    });
    jest.mocked(store.deleteItemAsync).mockRejectedValue(new Error('keychain'));
    const { auth } = setup({ store });
    await auth.signOut();

    const nextLaunch = setup({ store, tokenResponse: () => respond(400, { error: 'invalid_grant' }) });

    await expect(nextLaunch.auth.getAccessToken()).resolves.toBeNull();
    expect(nextLaunch.auth.getStatus()).toBe('signed-out');
  });

  it('waits for a sign-in in progress, then signs that account out', async () => {
    const browser = held<undefined>();
    const { auth, store } = setup({ authorize: (request) => browser.promise.then(() => callbackFor(request, ACCOUNT_A)) });

    const signingIn = auth.signIn();
    const signingOut = auth.signOut();
    browser.release(undefined);
    await signingIn;
    await signingOut;

    expect(auth.getStatus()).toBe('signed-out');
    expect(itemOf(store)).toEqual({ version: 2, registrations: [REGISTRATION_A], lastSubject: 'user-a', session: null });
  });

  it('revokes once for sign-out taps that arrive together', async () => {
    const { auth, fetch } = setup({ store: signedInStore() });

    await Promise.all([auth.signOut(), auth.signOut()]);

    expect(revocations(fetch)).toHaveLength(1);
  });

  it('keeps a sign-in made while a sign-out waits on OpenAI, in memory and in the keychain', async () => {
    const revoke = held<Awaited<TokenReply>>();
    const store = signedInStore();
    const { auth, fetch } = setup({ store, revoke: () => revoke.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const signingIn = auth.signIn();
    await flush();
    revoke.release(REVOKED);
    await signingOut;
    await signingIn;

    expect({ status: auth.getStatus(), keychainHasSession: itemOf(store) !== null && (itemOf(store) as StoredChatGPTAccounts).session !== null, revoked: revocations(fetch).map((form) => form.token) }).toEqual({
      status: 'signed-in',
      keychainHasSession: true,
      revoked: ['stored-refresh'],
    });
  });

  it('finishes a sign-out and a sign-in asked for back to back, in that order', async () => {
    const store = signedInStore();
    const { auth } = setup({ store });

    const both = Promise.all([auth.signOut(), auth.signIn()]);

    await expect(both).resolves.toEqual([{ revoked: true }, 'signed-in']);
    expect({ status: auth.getStatus(), session: (itemOf(store) as StoredChatGPTAccounts).session?.accessToken }).toEqual({
      status: 'signed-in',
      session: 'access-1',
    });
  });

  it('tells subscribers it is signing out until OpenAI and the keychain have let go', async () => {
    const revoke = held<Awaited<TokenReply>>();
    const { auth } = setup({ store: signedInStore(), revoke: () => revoke.promise });
    await auth.load();

    const signingOut = auth.signOut();
    await flush();
    const whileWaiting = auth.getStatus();
    revoke.release(REVOKED);
    await signingOut;

    expect([whileWaiting, auth.getStatus()]).toEqual(['signing-out', 'signed-out']);
  });

  it('waits for a refresh in flight and revokes the refresh token it produced', async () => {
    const store = signedInStore({ expiresAtMs: START_MS });
    const { auth, fetch } = setup({ store });

    const refreshing = auth.getAccessToken();
    await auth.signOut();
    await refreshing;

    expect(revocations(fetch).map((form) => form.token)).toEqual(['refresh-1']);
    expect(itemOf(store)).toMatchObject({ session: null });
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

  it('writes nothing but the one session item and the host id, through two accounts’ sign-ins and sign-outs', async () => {
    const { auth, store, signingInAs } = setup();

    await auth.signIn();
    await auth.signOut();
    signingInAs.current = ACCOUNT_B;
    await auth.signIn({ newAccount: true });
    await auth.signOut();

    expect(new Set(jest.mocked(store.setItemAsync).mock.calls.map(([key]) => key))).toEqual(new Set([SESSION_KEY, HOST_ID_KEY]));
  });
});
