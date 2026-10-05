/**
 * Where the ChatGPT sign-in stands. 'loading' lasts until the keychain has been read once; 'signing-out' until OpenAI and
 * the keychain have let go of the session.
 */
export type ChatGPTSessionStatus = 'loading' | 'signed-out' | 'signing-in' | 'signing-out' | 'signed-in';

export type ChatGPTAuthErrorKind = 'unavailable' | 'denied' | 'plan-not-allowed' | 'network' | 'failed';

/** The signed-in account's tokens. They live in expo-secure-store only: never in SQLite, a log or an error. */
export interface StoredChatGPTSession {
  readonly clientId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAtMs: number;
  readonly scopes: readonly string[];
}

export type SignInOutcome = 'signed-in' | 'cancelled';

/** `revoked` is false when OpenAI did not confirm the revocation; the device is signed out either way. */
export interface SignOutOutcome {
  readonly revoked: boolean;
}

/** The OAuth client this build signs in with. `clientId` is null when the build has none. */
export interface ChatGPTAuthConfig {
  readonly clientId: string | null;
  readonly redirectUri: string;
}
