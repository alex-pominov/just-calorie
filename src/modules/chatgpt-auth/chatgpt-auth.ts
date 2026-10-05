import type { Authorize } from './authorize';
import { ChatGPTAuthError } from './chatgpt-auth-error';
import type {
  ChatGPTRegistration,
  ChatGPTSessionStatus,
  SignInOptions,
  SignInOutcome,
  SignOutOutcome,
  StoredChatGPTAccounts,
  StoredChatGPTSession,
} from './chatgpt-auth.types';
import type { IdTokenIdentity } from './id-token';
import { readIdTokenIdentity } from './id-token';
import type { SecretStore } from './keychain-store';
import { HOST_ID_KEY, SESSION_KEY } from './keychain-store';
import { AGENT_NAME, CHATGPT_SCOPES, DYNAMIC_REGISTRATION_CLIENT_ID, PLAN_USAGE_SCOPE } from './openai-auth.constants';
import { NO_ACCOUNTS, parseStoredAccounts, serializeAccounts } from './stored-session';
import type { FetchLike, TokenSet } from './token-endpoint';
import { exchangeCode, refreshTokens, revokeRefreshToken } from './token-endpoint';

/** A token this close to expiry is refreshed first, so it cannot lapse during a 45-second estimate. */
export const REFRESH_MARGIN_MS = 5 * 60_000;

/** Waits before each retry of a revocation OpenAI could not answer: three attempts in all (qa f-15e7f1). */
export const REVOKE_RETRY_DELAYS_MS = [1_000, 2_000] as const;

/** One revocation attempt's limit: three attempts and both waits end within 15 s (qa f-3d8e7d). */
export const REVOKE_ATTEMPT_TIMEOUT_MS = 4_000;

export interface ChatGPTAuthDependencies {
  readonly store: SecretStore;
  readonly fetch: FetchLike;
  readonly authorize: Authorize;
  readonly randomToken: () => string;
  readonly newHostId: () => string;
  readonly now: () => number;
  /** Resolves after `ms`; tests pass one that does not wait. */
  readonly wait: (ms: number) => Promise<void>;
}

export interface ChatGPTAuth {
  getStatus(): ChatGPTSessionStatus;
  /** True once an account has registered on this phone: a plain sign-in then reuses its client. */
  hasSavedAccount(): boolean;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  signIn(options?: SignInOptions): Promise<SignInOutcome>;
  signOut(): Promise<SignOutOutcome>;
  getAccessToken(): Promise<string | null>;
  /** OpenAI refused this access token: the next `getAccessToken` refreshes before handing one out. */
  rejectAccessToken(token: string): void;
}

const grantsPlanUse = (scopes: readonly string[] | null): scopes is readonly string[] => scopes?.includes(PLAN_USAGE_SCOPE) === true;

const asAuthError = (error: unknown) => (error instanceof ChatGPTAuthError ? error : new ChatGPTAuthError('failed', { cause: error }));

/**
 * The client a callback's code is redeemed with. A first registration must name its newly issued client; a
 * reauthorization may omit it but never name another (sign-in docs, §3). Null refuses the callback.
 */
function issuedClientOf(registration: ChatGPTRegistration | null, named: string | null): string | null {
  if (registration !== null) return named === null || named === registration.clientId ? registration.clientId : null;

  return named !== null && named !== DYNAMIC_REGISTRATION_CLIENT_ID ? named : null;
}

/** The ChatGPT session over injected keychain, fetch, browser and clock, so tests never reach any of them. */
export function createChatGPTAuth(dependencies: ChatGPTAuthDependencies): ChatGPTAuth {
  const listeners = new Set<() => void>();
  const tokenEndpoint = { fetch: dependencies.fetch };
  let loaded = false;
  // Every account registered on this phone, and which one a plain sign-in reuses. Sign-out keeps both.
  let registrations: readonly ChatGPTRegistration[] = [];
  let lastSubject: string | null = null;
  let session: StoredChatGPTSession | null = null;
  // Bumped whenever the session is replaced or cleared. Work that began on an older session drops its result rather
  // than writing a token pair nobody will revoke.
  let generation = 0;
  let loading: Promise<void> | null = null;
  let signingIn: Promise<SignInOutcome> | null = null;
  let signingOut: Promise<SignOutOutcome> | null = null;
  let refreshing: Promise<StoredChatGPTSession | null> | null = null;
  let published: { readonly status: ChatGPTSessionStatus; readonly hasSavedAccount: boolean } = {
    status: 'loading',
    hasSavedAccount: false,
  };

  const savedRegistration = () =>
    registrations.find((registration) => registration.subject === lastSubject) ?? registrations.at(-1) ?? null;

  // The status is derived, never set, so no interleaving of sign-in, refresh and sign-out can leave it stale.
  function currentStatus(): ChatGPTSessionStatus {
    if (!loaded) return 'loading';
    if (signingIn !== null) return 'signing-in';
    if (signingOut !== null) return 'signing-out';

    return session === null ? 'signed-out' : 'signed-in';
  }

  function publish() {
    const next = { status: currentStatus(), hasSavedAccount: loaded && savedRegistration() !== null };

    if (next.status === published.status && next.hasSavedAccount === published.hasSavedAccount) return;

    published = next;
    listeners.forEach((listener) => listener());
  }

  function replaceSession(next: StoredChatGPTSession | null) {
    session = next;
    generation += 1;
    publish();
  }

  const accountsWith = (next: StoredChatGPTSession | null): StoredChatGPTAccounts => ({ registrations, lastSubject, session: next });

  const writeAccounts = (accounts: StoredChatGPTAccounts) => dependencies.store.setItemAsync(SESSION_KEY, serializeAccounts(accounts));

  const revokeQuietly = (clientId: string, refreshToken: string) => void revokeRefreshToken(tokenEndpoint, { clientId, refreshToken });

  // A version-1 item holds a session of the app-wide client this build no longer has: it is ended and deleted.
  async function readStoredAccounts(): Promise<{ readonly readable: boolean; readonly accounts: StoredChatGPTAccounts }> {
    try {
      const item = parseStoredAccounts(await dependencies.store.getItemAsync(SESSION_KEY));

      if (item.kind === 'accounts') return { readable: true, accounts: item.accounts };
      if (item.kind === 'legacy') {
        revokeQuietly(item.clientId, item.refreshToken);
        await dependencies.store.deleteItemAsync(SESSION_KEY).catch(() => null);
      }

      return { readable: true, accounts: NO_ACCOUNTS };
    } catch {
      return { readable: false, accounts: NO_ACCOUNTS };
    }
  }

  function load(): Promise<void> {
    if (loading !== null) return loading;

    const startedAt = generation;

    loading = readStoredAccounts().then(({ readable, accounts }) => {
      // An unreadable keychain (a locked phone) is read again on the next call rather than remembered as signed out.
      if (!readable) loading = null;
      if (generation === startedAt) {
        registrations = accounts.registrations;
        lastSubject = accounts.lastSubject;
        if (accounts.session !== null) replaceSession(accounts.session);
      }

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

  // Sign-in docs, §4: the ID token must be OpenAI's, for the issued client and this nonce.
  function identityOf(tokens: TokenSet, clientId: string, nonce: string): IdTokenIdentity {
    const identity =
      tokens.idToken === null ? null : readIdTokenIdentity(tokens.idToken, { clientId, nonce, nowSeconds: dependencies.now() / 1000 });

    if (identity === null) throw new ChatGPTAuthError('failed');

    return identity;
  }

  // Errors and recovery, "ChatGPT plan use isn't enabled": a validated account that declined plan use keeps its issued
  // client, marked, so the next sign-in repeats OAuth with that client and asks for consent again (qa f-101636). A
  // registration that cannot be written is simply not kept.
  async function keepDeclinedRegistration(clientId: string, identity: IdTokenIdentity) {
    const nextRegistrations = [
      ...registrations.filter((registration) => registration.subject !== identity.subject),
      { clientId, subject: identity.subject, email: identity.email, planDeclined: true as const },
    ];

    try {
      await writeAccounts({ registrations: nextRegistrations, lastSubject: identity.subject, session });
    } catch {
      return;
    }

    registrations = nextRegistrations;
    lastSubject = identity.subject;
    publish();
  }

  async function keepSignIn(tokens: TokenSet, clientId: string, identity: IdTokenIdentity) {
    if (tokens.refreshToken === null || tokens.scopes === null) throw new ChatGPTAuthError('failed');

    const next: StoredChatGPTSession = {
      clientId,
      subject: identity.subject,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAtMs: dependencies.now() + tokens.expiresInSeconds * 1000,
      scopes: tokens.scopes,
    };
    // A registration for an account already saved replaces that account's mapping; other accounts keep theirs.
    const nextRegistrations = [
      ...registrations.filter((registration) => registration.subject !== identity.subject),
      { clientId, subject: identity.subject, email: identity.email },
    ];

    await writeAccounts({ registrations: nextRegistrations, lastSubject: identity.subject, session: next });

    const replaced = session;

    registrations = nextRegistrations;
    lastSubject = identity.subject;
    replaceSession(next);
    // Only reachable outside the app's own UI, which offers sign-in only when signed out: the old tokens end at OpenAI.
    if (replaced !== null) revokeQuietly(replaced.clientId, replaced.refreshToken);
  }

  async function runSignIn(newAccount: boolean, pendingSignOut: Promise<SignOutOutcome> | null): Promise<SignInOutcome> {
    await load();
    // A sign-out still waiting on OpenAI would overwrite the keychain item this sign-in writes: let it finish first.
    await pendingSignOut?.catch(() => null);

    const registration = newAccount ? null : savedRegistration();
    const state = dependencies.randomToken();
    const nonce = dependencies.randomToken();
    // Sign-in docs, §2: a first registration names the app; a returning account reuses its client and hints its email.
    const result = await dependencies.authorize({
      clientId: registration?.clientId ?? DYNAMIC_REGISTRATION_CLIENT_ID,
      scopes: CHATGPT_SCOPES,
      state,
      nonce,
      hostId: await hostId(),
      agentNameHint: registration === null ? AGENT_NAME : null,
      loginHint: registration?.email ?? null,
      // Errors and recovery: prompt=consent after a decline, never on an ordinary sign-in.
      prompt: registration?.planDeclined === true ? 'consent' : null,
    });

    if (result.type === 'cancelled') return 'cancelled';
    if (result.type === 'error') throw new ChatGPTAuthError(result.error === 'access_denied' ? 'denied' : 'failed');
    if (result.state !== state) throw new ChatGPTAuthError('failed');

    const clientId = issuedClientOf(registration, result.clientId);

    // A saved account's sign-in naming another client was answered by another account (qa f-8f5227).
    if (clientId === null) throw new ChatGPTAuthError(registration === null ? 'failed' : 'another-account');

    const exchanged = await exchangeCode(tokenEndpoint, {
      clientId,
      code: result.code,
      codeVerifier: result.codeVerifier,
      redirectUri: result.redirectUri,
    });

    if (!exchanged.ok) {
      // Errors and recovery, "Invalid client": a saved client OpenAI no longer accepts is dropped, so the next Continue
      // registers a fresh one instead of failing the same way for ever.
      if (exchanged.reason === 'invalid-client' && registration !== null) await forgetRegistration(registration.subject);
      throw new ChatGPTAuthError('failed');
    }

    const { tokens } = exchanged;

    try {
      const identity = identityOf(tokens, clientId, nonce);

      // Accounts and sessions docs: confirm a returning account is the one selected before replacing anything.
      if (registration !== null && identity.subject !== registration.subject) throw new ChatGPTAuthError('another-account');

      if (!grantsPlanUse(tokens.scopes)) {
        await keepDeclinedRegistration(clientId, identity);
        throw new ChatGPTAuthError('plan-not-allowed');
      }

      await keepSignIn(tokens, clientId, identity);

      return 'signed-in';
    } catch (error) {
      // OpenAI issued tokens this sign-in will not keep: end them there too.
      if (tokens.refreshToken !== null) revokeQuietly(clientId, tokens.refreshToken);
      throw error;
    }
  }

  function signIn(options: SignInOptions = {}): Promise<SignInOutcome> {
    if (signingIn === null) {
      signingIn = runSignIn(options.newAccount === true, signingOut)
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

  // Errors and recovery, refresh errors: clear unusable tokens and keep the issued client for reauthorization. A write
  // that fails leaves a dead token, which the next launch's refresh ends the same way.
  async function endSession() {
    replaceSession(null);
    await writeAccounts(accountsWith(null)).catch(() => null);
  }

  // A registration whose client OpenAI calls invalid is forgotten; a write that fails leaves it, to fail the same way.
  async function forgetRegistration(subject: string) {
    registrations = registrations.filter((registration) => registration.subject !== subject);
    if (lastSubject === subject) lastSubject = null;
    publish();
    await writeAccounts(accountsWith(session)).catch(() => null);
  }

  async function refresh(current: StoredChatGPTSession, startedAt: number): Promise<StoredChatGPTSession | null> {
    const result = await refreshTokens(tokenEndpoint, { clientId: current.clientId, refreshToken: current.refreshToken });

    if (generation !== startedAt) {
      if (result.ok && result.tokens.refreshToken !== null) revokeQuietly(current.clientId, result.tokens.refreshToken);
      return null;
    }

    // Errors and recovery, "Invalid client": the session and the client both end, so the next Continue registers anew.
    if (!result.ok && result.reason === 'invalid-client') {
      replaceSession(null);
      await forgetRegistration(current.subject);
      return null;
    }

    const scopes = result.ok ? (result.tokens.scopes ?? current.scopes) : null;

    if (!result.ok || !grantsPlanUse(scopes)) {
      if (result.ok) {
        // A refresh that took plan use away still issued tokens: the session ends, so they end at OpenAI too.
        revokeQuietly(current.clientId, result.tokens.refreshToken ?? current.refreshToken);
        // Plan use turned off is a decline, so the next sign-in asks for consent at once (qa f-39f149).
        registrations = registrations.map((registration) =>
          registration.subject === current.subject ? { ...registration, planDeclined: true } : registration,
        );
      }

      await endSession();
      return null;
    }

    const next: StoredChatGPTSession = {
      ...current,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken ?? current.refreshToken,
      expiresAtMs: dependencies.now() + result.tokens.expiresInSeconds * 1000,
      scopes,
    };

    replaceSession(next);
    // The new pair works from memory either way; if it cannot be stored, the next launch finds the spent refresh
    // token, OpenAI refuses it, and the user signs in again.
    await writeAccounts(accountsWith(next)).catch(() => null);

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

  // Accounts and sessions docs, "End the renewable session": for a network failure or 5xx, retry with backoff while the
  // refresh token is still available. A 4xx is final.
  async function revokeWithRetry(current: StoredChatGPTSession): Promise<boolean> {
    for (let attempt = 0; ; attempt += 1) {
      const result = await revokeRefreshToken(
        { fetch: dependencies.fetch, timeoutMs: REVOKE_ATTEMPT_TIMEOUT_MS },
        { clientId: current.clientId, refreshToken: current.refreshToken },
      );
      const delay = REVOKE_RETRY_DELAYS_MS[attempt];

      if (result !== 'unreachable' || delay === undefined) return result === 'revoked';

      await dependencies.wait(delay);
    }
  }

  // Accounts and sessions docs, sign out: stop requests, end the renewable session, clear the tokens, and keep the
  // account/client mapping and the host ID. Each of sign-in and sign-out waits only for the other already under way.
  async function runSignOut(pendingSignIn: Promise<SignInOutcome> | null): Promise<SignOutOutcome> {
    await load();
    await pendingSignIn?.catch(() => null);
    // Waiting lets the refresh land first, so the refresh token revoked is the newest one.
    await refreshing?.catch(() => null);

    const current = session;

    if (current === null) return { revoked: true };

    // No token is handed out, and no refresh can start, from here on.
    replaceSession(null);

    // The tokens leave the keychain before the revocation, which holds the refresh token in memory only: a phone quit
    // mid-revocation relaunches signed out (qa f-3d8e7d). OpenAI allows finishing locally and saying so.
    const cleared = await writeAccounts(accountsWith(null)).then(
      () => null,
      (error: unknown) => ({ error }),
    );
    const revoked = await revokeWithRetry(current);

    if (cleared !== null) {
      // OpenAI ended the session, so its tokens are never handed out again. Failing a second write, the item is deleted,
      // registration and all; failing that too, it is rewritten as expired, so the next launch must refresh first and
      // OpenAI refuses the revoked token.
      if (revoked) {
        await writeAccounts(accountsWith(null))
          .catch(() => dependencies.store.deleteItemAsync(SESSION_KEY))
          .catch(() => writeAccounts(accountsWith({ ...current, expiresAtMs: 0 })))
          .catch(() => null);
        return { revoked };
      }

      // Neither OpenAI nor the keychain let go: this device is still signed in, so put the session back to retry.
      if (session === null) replaceSession(current);
      throw new ChatGPTAuthError('failed', { cause: cleared.error });
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
    getStatus: () => published.status,
    hasSavedAccount: () => published.hasSavedAccount,
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
