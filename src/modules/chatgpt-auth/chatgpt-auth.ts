import type { AuthorizeRequest, AuthorizeResult } from './authorize';
import { ChatGPTAuthError } from './chatgpt-auth-error';
import type {
  ChatGPTAuthConfig,
  ChatGPTSessionStatus,
  SignInOutcome,
  SignOutOutcome,
  StoredChatGPTSession,
} from './chatgpt-auth.types';
import { hasExpectedIdTokenClaims } from './id-token';
import type { SecretStore } from './keychain-store';
import { HOST_ID_KEY, SESSION_KEY } from './keychain-store';
import { CHATGPT_SCOPES, PLAN_USAGE_SCOPE } from './openai-auth.constants';
import { parseStoredSession, serializeSession } from './stored-session';
import type { FetchLike, TokenSet } from './token-endpoint';
import { exchangeCode, refreshTokens, revokeRefreshToken } from './token-endpoint';

/** A token this close to expiry is refreshed first, so it cannot lapse during a 45-second estimate. */
export const REFRESH_MARGIN_MS = 5 * 60_000;

export interface ChatGPTAuthDependencies {
  readonly getConfig: () => ChatGPTAuthConfig;
  readonly store: SecretStore;
  readonly fetch: FetchLike;
  readonly authorize: (request: AuthorizeRequest) => Promise<AuthorizeResult>;
  readonly randomToken: () => string;
  readonly newHostId: () => string;
  readonly now: () => number;
}

export interface ChatGPTAuth {
  getStatus(): ChatGPTSessionStatus;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  signIn(): Promise<SignInOutcome>;
  signOut(): Promise<SignOutOutcome>;
  getAccessToken(): Promise<string | null>;
  /** OpenAI refused this access token: the next `getAccessToken` refreshes before handing one out. */
  rejectAccessToken(token: string): void;
}

const grantsPlanUse = (scopes: readonly string[] | null): scopes is readonly string[] => scopes?.includes(PLAN_USAGE_SCOPE) === true;

const asAuthError = (error: unknown) => (error instanceof ChatGPTAuthError ? error : new ChatGPTAuthError('failed', { cause: error }));

/** The ChatGPT session over injected keychain, fetch, browser and clock, so tests never reach any of them. */
export function createChatGPTAuth(dependencies: ChatGPTAuthDependencies): ChatGPTAuth {
  const listeners = new Set<() => void>();
  const tokenEndpoint = { fetch: dependencies.fetch };
  let loaded = false;
  let session: StoredChatGPTSession | null = null;
  // Bumped whenever the session is replaced or cleared. Work that began on an older session drops its result rather
  // than writing a token pair nobody will revoke.
  let generation = 0;
  let loading: Promise<void> | null = null;
  let signingIn: Promise<SignInOutcome> | null = null;
  let signingOut: Promise<SignOutOutcome> | null = null;
  let refreshing: Promise<StoredChatGPTSession | null> | null = null;
  let published: ChatGPTSessionStatus = 'loading';

  // The status is derived, never set, so no interleaving of sign-in, refresh and sign-out can leave it stale.
  function currentStatus(): ChatGPTSessionStatus {
    if (!loaded) return 'loading';
    if (signingIn !== null) return 'signing-in';
    if (signingOut !== null) return 'signing-out';

    return session === null ? 'signed-out' : 'signed-in';
  }

  function publish() {
    const next = currentStatus();

    if (next === published) return;

    published = next;
    listeners.forEach((listener) => listener());
  }

  function replaceSession(next: StoredChatGPTSession | null) {
    session = next;
    generation += 1;
    publish();
  }

  const revokeQuietly = (clientId: string, refreshToken: string) => void revokeRefreshToken(tokenEndpoint, { clientId, refreshToken });

  // A session another client signed in, such as a development build's on the same phone, is deleted, never used.
  async function readStoredSession(): Promise<{ readonly readable: boolean; readonly stored: StoredChatGPTSession | null }> {
    try {
      const stored = parseStoredSession(await dependencies.store.getItemAsync(SESSION_KEY));

      if (stored === null || stored.clientId === dependencies.getConfig().clientId) return { readable: true, stored };

      revokeQuietly(stored.clientId, stored.refreshToken);
      await dependencies.store.deleteItemAsync(SESSION_KEY).catch(() => null);

      return { readable: true, stored: null };
    } catch {
      return { readable: false, stored: null };
    }
  }

  function load(): Promise<void> {
    if (loading !== null) return loading;

    const startedAt = generation;

    loading = readStoredSession().then(({ readable, stored }) => {
      // An unreadable keychain (a locked phone) is read again on the next call rather than remembered as signed out.
      if (!readable) loading = null;
      if (stored !== null && generation === startedAt) replaceSession(stored);

      loaded = true;
      publish();
    });

    return loading;
  }

  async function hostId(): Promise<string> {
    const existing = await dependencies.store.getItemAsync(HOST_ID_KEY);

    if (existing !== null) return existing;

    const created = dependencies.newHostId();
    await dependencies.store.setItemAsync(HOST_ID_KEY, created);

    return created;
  }

  function sessionFrom(tokens: TokenSet, config: { readonly clientId: string }, nonce: string): StoredChatGPTSession {
    if (!grantsPlanUse(tokens.scopes)) throw new ChatGPTAuthError('plan-not-allowed');

    const nowMs = dependencies.now();
    const claimsMatch =
      tokens.idToken !== null && hasExpectedIdTokenClaims(tokens.idToken, { clientId: config.clientId, nonce, nowSeconds: nowMs / 1000 });

    if (tokens.refreshToken === null || !claimsMatch) throw new ChatGPTAuthError('failed');

    return {
      clientId: config.clientId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAtMs: nowMs + tokens.expiresInSeconds * 1000,
      scopes: tokens.scopes,
    };
  }

  async function runSignIn(
    config: { readonly clientId: string; readonly redirectUri: string },
    pendingSignOut: Promise<SignOutOutcome> | null,
  ): Promise<SignInOutcome> {
    await load();
    // A sign-out still waiting on OpenAI would delete the keychain item this sign-in writes: let it finish first.
    await pendingSignOut?.catch(() => null);

    const state = dependencies.randomToken();
    const nonce = dependencies.randomToken();
    const result = await dependencies.authorize({ ...config, scopes: CHATGPT_SCOPES, state, nonce, hostId: await hostId() });

    if (result.type === 'cancelled') return 'cancelled';
    if (result.type === 'error') throw new ChatGPTAuthError(result.error === 'access_denied' ? 'denied' : 'failed');
    if (result.state !== state) throw new ChatGPTAuthError('failed');
    if (result.clientId !== null && result.clientId !== config.clientId) throw new ChatGPTAuthError('failed');

    const tokens = await exchangeCode(tokenEndpoint, { ...config, code: result.code, codeVerifier: result.codeVerifier });

    try {
      const next = sessionFrom(tokens, config, nonce);

      await dependencies.store.setItemAsync(SESSION_KEY, serializeSession(next));
      replaceSession(next);

      return 'signed-in';
    } catch (error) {
      // OpenAI issued tokens this sign-in will not keep: end them there too.
      if (tokens.refreshToken !== null) revokeQuietly(config.clientId, tokens.refreshToken);
      throw error;
    }
  }

  function signIn(): Promise<SignInOutcome> {
    const { clientId, redirectUri } = dependencies.getConfig();

    if (clientId === null) {
      return load().then(() => {
        throw new ChatGPTAuthError('unavailable');
      });
    }

    if (signingIn === null) {
      signingIn = runSignIn({ clientId, redirectUri }, signingOut)
        .catch((error: unknown) => {
          throw asAuthError(error);
        })
        .finally(() => {
          signingIn = null;
          publish();
        });
      publish();
    }

    return signingIn;
  }

  // The refresh token is dead: forget it here and in the keychain. A failed delete leaves a dead token that the next
  // launch's refresh ends the same way.
  async function endSession() {
    replaceSession(null);
    await dependencies.store.deleteItemAsync(SESSION_KEY).catch(() => null);
  }

  async function refresh(current: StoredChatGPTSession, startedAt: number): Promise<StoredChatGPTSession | null> {
    const result = await refreshTokens(tokenEndpoint, { clientId: current.clientId, refreshToken: current.refreshToken });

    if (generation !== startedAt) {
      if (result.ok && result.tokens.refreshToken !== null) revokeQuietly(current.clientId, result.tokens.refreshToken);
      return null;
    }

    const scopes = result.ok ? (result.tokens.scopes ?? current.scopes) : null;

    if (!result.ok || !grantsPlanUse(scopes)) {
      // A refresh that took plan use away still issued tokens: the session ends, so they end at OpenAI too.
      if (result.ok) revokeQuietly(current.clientId, result.tokens.refreshToken ?? current.refreshToken);
      await endSession();
      return null;
    }

    const next: StoredChatGPTSession = {
      clientId: current.clientId,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken ?? current.refreshToken,
      expiresAtMs: dependencies.now() + result.tokens.expiresInSeconds * 1000,
      scopes,
    };

    replaceSession(next);
    // The new pair works from memory either way; if it cannot be stored, the next launch finds the spent refresh
    // token, OpenAI refuses it, and the user signs in again.
    await dependencies.store.setItemAsync(SESSION_KEY, serializeSession(next)).catch(() => null);

    return next;
  }

  async function getAccessToken(): Promise<string | null> {
    await load();

    const current = session;

    if (current === null) return null;
    if (current.expiresAtMs - dependencies.now() > REFRESH_MARGIN_MS) return current.accessToken;

    refreshing ??= refresh(current, generation).finally(() => {
      refreshing = null;
    });

    try {
      return (await refreshing)?.accessToken ?? null;
    } catch (error) {
      // An early refresh that could not reach OpenAI leaves a token that has not expired yet: keep using it.
      if (session === current && current.expiresAtMs > dependencies.now()) return current.accessToken;
      throw error;
    }
  }

  function rejectAccessToken(token: string) {
    if (session?.accessToken === token) session = { ...session, expiresAtMs: 0 };
  }

  // Each waits only for the other that was already under way when it was asked for, so neither waits on the other.
  async function runSignOut(pendingSignIn: Promise<SignInOutcome> | null): Promise<SignOutOutcome> {
    await load();
    await pendingSignIn?.catch(() => null);
    // Waiting lets the refresh land first, so the refresh token revoked is the newest one.
    await refreshing?.catch(() => null);

    const current = session;

    if (current === null) return { revoked: true };

    // No token is handed out, and no refresh can start, from here on.
    replaceSession(null);

    const revoked = await revokeRefreshToken(tokenEndpoint, { clientId: current.clientId, refreshToken: current.refreshToken });

    try {
      await dependencies.store.deleteItemAsync(SESSION_KEY);
    } catch (error) {
      // OpenAI ended the session, so its tokens are never handed out again. If one more delete fails too, the item is
      // rewritten as expired, so the next launch must refresh it first, and OpenAI refuses the revoked token.
      if (revoked) {
        await dependencies.store
          .deleteItemAsync(SESSION_KEY)
          .catch(() => dependencies.store.setItemAsync(SESSION_KEY, serializeSession({ ...current, expiresAtMs: 0 })))
          .catch(() => null);
        return { revoked };
      }

      // Neither OpenAI nor the keychain let go: this device is still signed in, so put the session back to retry.
      if (session === null) replaceSession(current);
      throw new ChatGPTAuthError('failed', { cause: error });
    }

    return { revoked };
  }

  function signOut(): Promise<SignOutOutcome> {
    signingOut ??= runSignOut(signingIn).finally(() => {
      signingOut = null;
      publish();
    });
    publish();

    return signingOut;
  }

  return {
    getStatus: () => published,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    signIn,
    signOut,
    getAccessToken,
    rejectAccessToken,
  };
}
