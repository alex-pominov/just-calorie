import { ChatGPTAuthError } from './chatgpt-auth-error';
import { OPENAI_API_RESOURCE, OPENAI_AUTH_ENDPOINTS } from './openai-auth.constants';

/** Past this a token request counts as 'network'. Signing in waits on it, so it is shorter than an estimate's. */
export const TOKEN_REQUEST_TIMEOUT_MS = 30_000;

// The part of a fetch Response this file reads, so a test can hand over a plain object.
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<HttpResponse>;

export interface TokenEndpointDependencies {
  readonly fetch: FetchLike;
  readonly timeoutMs?: number | undefined;
}

/** One token response. `scopes` is null when the response named none, which a refresh may do. */
export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly idToken: string | null;
  readonly expiresInSeconds: number;
  readonly scopes: readonly string[] | null;
}

export type RefreshResult = { readonly ok: true; readonly tokens: TokenSet } | { readonly ok: false; readonly reason: 'ended' };

const formBody = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

const optionalString = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null);

interface TokenEndpointReply {
  readonly ok: boolean;
  readonly status: number;
  /** The parsed JSON body of a 2xx; an error body is never read. */
  readonly body: unknown;
}

// A failure carries no body: OAuth error bodies can quote what they were sent, and a token must never reach a message.
// One timer covers the response AND its body, so a server that stalls mid-body still ends as 'network'.
async function post(
  dependencies: TokenEndpointDependencies,
  request: { readonly url: string; readonly fields: Record<string, string>; readonly readBody: boolean },
): Promise<TokenEndpointReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? TOKEN_REQUEST_TIMEOUT_MS);

  try {
    const response = await dependencies
      .fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: formBody(request.fields),
        signal: controller.signal,
      })
      .catch((error: unknown) => {
        throw new ChatGPTAuthError('network', { cause: error });
      });

    if (!response.ok || !request.readBody) return { ok: response.ok, status: response.status, body: undefined };

    // Not every fetch stops reading a body when its signal aborts, so the read races the abort itself.
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('The token request timed out')));
    });
    const body = await Promise.race([response.json(), aborted]).catch((error: unknown) => {
      throw new ChatGPTAuthError(controller.signal.aborted ? 'network' : 'failed', { cause: error });
    });

    return { ok: true, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function readTokenSet(body: unknown): TokenSet {
  const accessToken = optionalString(prop(body, 'access_token'));
  const expiresIn = prop(body, 'expires_in');
  const tokenType = prop(body, 'token_type');
  const scope = optionalString(prop(body, 'scope'));

  if (accessToken === null) throw new ChatGPTAuthError('failed');
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) throw new ChatGPTAuthError('failed');
  if (tokenType !== undefined && String(tokenType).toLowerCase() !== 'bearer') throw new ChatGPTAuthError('failed');

  return {
    accessToken,
    refreshToken: optionalString(prop(body, 'refresh_token')),
    idToken: optionalString(prop(body, 'id_token')),
    expiresInSeconds: expiresIn,
    scopes: scope === null ? null : scope.split(/\s+/).filter((part) => part !== ''),
  };
}

/** Redeems an authorization code with its PKCE verifier. A public client: no secret is sent. */
export async function exchangeCode(
  dependencies: TokenEndpointDependencies,
  request: { readonly clientId: string; readonly code: string; readonly codeVerifier: string; readonly redirectUri: string },
): Promise<TokenSet> {
  const reply = await post(dependencies, {
    url: OPENAI_AUTH_ENDPOINTS.token,
    fields: {
      grant_type: 'authorization_code',
      client_id: request.clientId,
      code: request.code,
      code_verifier: request.codeVerifier,
      redirect_uri: request.redirectUri,
      resource: OPENAI_API_RESOURCE,
    },
    readBody: true,
  });

  if (!reply.ok) throw new ChatGPTAuthError('failed');

  return readTokenSet(reply.body);
}

// 408 and 429 are the server asking for later, and 5xx is the server failing; any other 4xx means the refresh
// token will never work again (invalid_grant, a reused or expired token, an invalid client).
const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;

/** Swaps the refresh token for a new pair. Omitting `scope` keeps the grant as it was. */
export async function refreshTokens(
  dependencies: TokenEndpointDependencies,
  request: { readonly clientId: string; readonly refreshToken: string },
): Promise<RefreshResult> {
  const reply = await post(dependencies, {
    url: OPENAI_AUTH_ENDPOINTS.token,
    fields: { grant_type: 'refresh_token', client_id: request.clientId, refresh_token: request.refreshToken, resource: OPENAI_API_RESOURCE },
    readBody: true,
  });

  if (reply.ok) return { ok: true, tokens: readTokenSet(reply.body) };
  if (isTransient(reply.status)) throw new ChatGPTAuthError('network');

  return { ok: false, reason: 'ended' };
}

/** Ends the renewable session. True only when OpenAI confirmed it; an empty 200 is success. */
export async function revokeRefreshToken(
  dependencies: TokenEndpointDependencies,
  request: { readonly clientId: string; readonly refreshToken: string },
): Promise<boolean> {
  try {
    const reply = await post(dependencies, {
      url: OPENAI_AUTH_ENDPOINTS.revocation,
      fields: { token: request.refreshToken, token_type_hint: 'refresh_token', client_id: request.clientId },
      readBody: false,
    });

    return reply.ok;
  } catch (error) {
    if (error instanceof ChatGPTAuthError) return false;
    throw error;
  }
}
