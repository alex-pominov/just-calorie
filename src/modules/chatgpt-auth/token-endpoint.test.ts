import { ChatGPTAuthError } from './chatgpt-auth-error';
import { OPENAI_API_RESOURCE, OPENAI_AUTH_ENDPOINTS } from './openai-auth.constants';
import { exchangeCode, refreshTokens, revokeRefreshToken } from './token-endpoint';

const ACCESS = 'access-FAKE-0123456789-must-never-leak';
const REFRESH = 'refresh-FAKE-0123456789-must-never-leak';
const ID_TOKEN = 'header.payload.signature';
const CLIENT_ID = 'oaiapp_test';

const tokenBody = (overrides: Record<string, unknown> = {}) => ({
  access_token: ACCESS,
  refresh_token: REFRESH,
  id_token: ID_TOKEN,
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  ...overrides,
});

const respond = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

function sentForm(fetch: jest.Mock): Record<string, string> {
  const init: unknown = fetch.mock.calls[0]?.[1];
  const body = typeof init === 'object' && init !== null && 'body' in init ? init.body : undefined;

  return Object.fromEntries(new URLSearchParams(typeof body === 'string' ? body : ''));
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('expected a rejection');
}

function everyTextOf(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current !== undefined && current !== null) {
    parts.push(String(current), JSON.stringify(current) ?? '');
    if (current instanceof Error) parts.push(current.message, current.stack ?? '');
    current = current instanceof Error ? current.cause : undefined;
  }

  return parts.join('\n');
}

const CODE_REQUEST = { clientId: CLIENT_ID, code: 'the-code', codeVerifier: 'the-verifier', redirectUri: 'justcalorie://auth/callback' };

describe('exchangeCode', () => {
  it('posts a form-encoded authorization_code grant with PKCE and the API resource, and no secret', async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(200, tokenBody()));

    await exchangeCode({ fetch }, CODE_REQUEST);

    expect(fetch.mock.calls[0]?.[0]).toBe(OPENAI_AUTH_ENDPOINTS.token);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    });
    expect(sentForm(fetch)).toEqual({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: 'justcalorie://auth/callback',
      resource: OPENAI_API_RESOURCE,
    });
  });

  it('reads the tokens, their lifetime and the granted scopes', async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(200, tokenBody()));

    await expect(exchangeCode({ fetch }, CODE_REQUEST)).resolves.toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      idToken: ID_TOKEN,
      expiresInSeconds: 3600,
      scopes: ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct'],
    });
  });

  it("maps a rejected fetch to 'network'", async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => Promise.reject(new TypeError('Network request failed')));

    await expect(exchangeCode({ fetch }, CODE_REQUEST)).rejects.toMatchObject({ name: 'ChatGPTAuthError', kind: 'network' });
  });

  it("maps a request that outlives its timeout to 'network'", async () => {
    jest.useFakeTimers();
    const fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );

    const pending = caught(exchangeCode({ fetch, timeoutMs: 1000 }, CODE_REQUEST));
    jest.advanceTimersByTime(1000);

    await expect(pending).resolves.toMatchObject({ kind: 'network' });
    jest.useRealTimers();
  });

  it("maps a body that stalls past the timeout to 'network', so a sign-in or refresh cannot hang", async () => {
    jest.useFakeTimers();
    const fetch = jest.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({ ok: true, status: 200, json: () => new Promise<never>(() => undefined) }),
    );

    const pending = caught(exchangeCode({ fetch, timeoutMs: 1000 }, CODE_REQUEST));
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1000);

    await expect(pending).resolves.toMatchObject({ kind: 'network' });
    jest.useRealTimers();
  });

  it.each([400, 401, 500])("maps HTTP %i to 'failed'", async (status) => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(status, { error: 'invalid_grant' }));

    await expect(exchangeCode({ fetch }, CODE_REQUEST)).rejects.toMatchObject({ kind: 'failed' });
  });

  it.each([
    ['no access token', tokenBody({ access_token: undefined })],
    ['a blank access token', tokenBody({ access_token: '  ' })],
    ['no lifetime', tokenBody({ expires_in: undefined })],
    ['a zero lifetime', tokenBody({ expires_in: 0 })],
    ['a token type other than Bearer', tokenBody({ token_type: 'mac' })],
    ['a body that is not an object', 'tokens'],
  ])("maps a token response with %s to 'failed'", async (_case, body) => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(200, body));

    await expect(exchangeCode({ fetch }, CODE_REQUEST)).rejects.toMatchObject({ kind: 'failed' });
  });

  it("maps a 2xx body that is not JSON to 'failed'", async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected token <')) }),
    );

    await expect(exchangeCode({ fetch }, CODE_REQUEST)).rejects.toMatchObject({ kind: 'failed' });
  });

  it('reads a response with no refresh token, ID token or scope as null', async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(200, tokenBody({ refresh_token: undefined, id_token: undefined, scope: undefined })));

    await expect(exchangeCode({ fetch }, CODE_REQUEST)).resolves.toMatchObject({ refreshToken: null, idToken: null, scopes: null });
  });
});

describe('refreshTokens', () => {
  const REFRESH_REQUEST = { clientId: CLIENT_ID, refreshToken: REFRESH };

  it('posts a refresh_token grant with the issued client and the API resource, and no scope', async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(200, tokenBody()));

    await refreshTokens({ fetch }, REFRESH_REQUEST);

    expect(fetch.mock.calls[0]?.[0]).toBe(OPENAI_AUTH_ENDPOINTS.token);
    expect(sentForm(fetch)).toEqual({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: REFRESH,
      resource: OPENAI_API_RESOURCE,
    });
  });

  it('returns the replacement token set', async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(200, tokenBody({ access_token: 'next-access', refresh_token: 'next-refresh' })));

    await expect(refreshTokens({ fetch }, REFRESH_REQUEST)).resolves.toMatchObject({
      ok: true,
      tokens: { accessToken: 'next-access', refreshToken: 'next-refresh' },
    });
  });

  it.each([400, 401, 403])('reads HTTP %i as a session that has ended, so the user signs in again', async (status) => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(status, { error: 'invalid_grant' }));

    await expect(refreshTokens({ fetch }, REFRESH_REQUEST)).resolves.toEqual({ ok: false, reason: 'ended' });
  });

  it.each([408, 429, 500, 503])("keeps the session on HTTP %i and throws 'network', so a later call can retry", async (status) => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(status));

    await expect(refreshTokens({ fetch }, REFRESH_REQUEST)).rejects.toMatchObject({ kind: 'network' });
  });

  it("maps a rejected fetch to 'network'", async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => Promise.reject(new TypeError('Network request failed')));

    await expect(refreshTokens({ fetch }, REFRESH_REQUEST)).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('revokeRefreshToken', () => {
  const REVOKE_REQUEST = { clientId: CLIENT_ID, refreshToken: REFRESH };

  it('posts the refresh token with its type hint and the issued client to the revocation endpoint', async () => {
    const fetch = jest.fn((_url: string, _init: RequestInit) => respond(200));

    await expect(revokeRefreshToken({ fetch }, REVOKE_REQUEST)).resolves.toBe(true);

    expect(fetch.mock.calls[0]?.[0]).toBe(OPENAI_AUTH_ENDPOINTS.revocation);
    expect(sentForm(fetch)).toEqual({ token: REFRESH, token_type_hint: 'refresh_token', client_id: CLIENT_ID });
  });

  it.each([
    ['an error status', () => respond(503)],
    ['a rejected fetch', () => Promise.reject(new TypeError('Network request failed'))],
  ])('reports an unconfirmed revocation on %s instead of throwing', async (_case, reply) => {
    await expect(revokeRefreshToken({ fetch: jest.fn(reply) }, REVOKE_REQUEST)).resolves.toBe(false);
  });
});

describe('never lets a token out', () => {
  const echoing = { error: 'invalid_grant', error_description: `bad token ${REFRESH} ${ACCESS}` };

  it.each([
    ['a refused code exchange', () => exchangeCode({ fetch: jest.fn((_url: string, _init: RequestInit) => respond(400, echoing)) }, CODE_REQUEST)],
    ['a malformed token response', () => exchangeCode({ fetch: jest.fn((_url: string, _init: RequestInit) => respond(200, { ...echoing, expires_in: 'soon' })) }, CODE_REQUEST)],
    ['a refresh that failed on the network', () => refreshTokens({ fetch: jest.fn((_url: string, _init: RequestInit) => respond(503, echoing)) }, { clientId: CLIENT_ID, refreshToken: REFRESH })],
  ])('in the error from %s', async (_case, run) => {
    const error = await caught(run());

    expect(error).toBeInstanceOf(ChatGPTAuthError);
    expect(everyTextOf(error)).not.toContain(REFRESH);
    expect(everyTextOf(error)).not.toContain(ACCESS);
  });
});
