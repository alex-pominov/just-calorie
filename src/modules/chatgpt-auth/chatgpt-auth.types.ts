/**
 * Where the ChatGPT sign-in stands. 'loading' lasts until the keychain has been read once; 'signing-out' until OpenAI and
 * the keychain have let go of the session.
 */
export type ChatGPTSessionStatus = 'loading' | 'signed-out' | 'signing-in' | 'signing-out' | 'signed-in';

export type ChatGPTAuthErrorKind = 'unavailable' | 'denied' | 'plan-not-allowed' | 'another-account' | 'network' | 'failed';

/** One ChatGPT account's own OAuth client, registered on this phone. Not a credential: a client ID alone grants nothing. */
export interface ChatGPTRegistration {
  /** The `oaiapp_` client OpenAI issued to this account at its first sign-in here. */
  readonly clientId: string;
  /** The validated ID token's `sub`: the account's identity, and the key registrations are kept by. */
  readonly subject: string;
  /** Sent as `login_hint` when the account signs in again. Not unique: two accounts may share one. */
  readonly email: string | null;
  /** The account declined ChatGPT plan use at its last sign-in, so the next one asks for consent again. */
  readonly planDeclined?: true;
}

/** The signed-in account's tokens and the client they were issued to. Never in SQLite, a log or an error. */
export interface StoredChatGPTSession {
  readonly clientId: string;
  readonly subject: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAtMs: number;
  readonly scopes: readonly string[];
}

/** Everything the one keychain item holds. Signing out empties `session` and keeps the rest. */
export interface StoredChatGPTAccounts {
  readonly registrations: readonly ChatGPTRegistration[];
  /** The account the next plain sign-in reuses. */
  readonly lastSubject: string | null;
  readonly session: StoredChatGPTSession | null;
}

export type SignInOutcome = 'signed-in' | 'cancelled';

export interface SignInOptions {
  /** Register a new client instead of reusing the saved account's, so another ChatGPT account can sign in. */
  readonly newAccount?: boolean | undefined;
}

/** `revoked` is false when OpenAI did not confirm the revocation; the device is signed out either way. */
export interface SignOutOutcome {
  readonly revoked: boolean;
}
