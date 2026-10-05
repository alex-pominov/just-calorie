import type { ChatGPTRegistration, StoredChatGPTAccounts, StoredChatGPTSession } from './chatgpt-auth.types';

// Bump when the shape changes. Version 1 held one app-wide client's session; see `parseStoredAccounts`.
const FORMAT_VERSION = 2;
const LEGACY_FORMAT_VERSION = 1;

export const NO_ACCOUNTS: StoredChatGPTAccounts = { registrations: [], lastSubject: null, session: null };

/** What the keychain item holds: this format, a version-1 session to end at OpenAI, or nothing usable. */
export type StoredItem =
  | { readonly kind: 'accounts'; readonly accounts: StoredChatGPTAccounts }
  | { readonly kind: 'legacy'; readonly clientId: string; readonly refreshToken: string }
  | { readonly kind: 'none' };

function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** The one keychain value. One item, so a crash can never leave tokens beside the wrong client or half a pair. */
export function serializeAccounts(accounts: StoredChatGPTAccounts): string {
  return JSON.stringify({ version: FORMAT_VERSION, ...accounts });
}

function parseRegistration(value: unknown): ChatGPTRegistration | null {
  const clientId = prop(value, 'clientId');
  const subject = prop(value, 'subject');
  const email = prop(value, 'email');

  if (!nonBlank(clientId) || !nonBlank(subject)) return null;

  const registration = { clientId, subject, email: nonBlank(email) ? email : null };

  return prop(value, 'planDeclined') === true ? { ...registration, planDeclined: true } : registration;
}

function parseSession(value: unknown): StoredChatGPTSession | null {
  const clientId = prop(value, 'clientId');
  const subject = prop(value, 'subject');
  const accessToken = prop(value, 'accessToken');
  const refreshToken = prop(value, 'refreshToken');
  const expiresAtMs = prop(value, 'expiresAtMs');
  const scopes = prop(value, 'scopes');

  if (!nonBlank(clientId) || !nonBlank(subject) || !nonBlank(accessToken) || !nonBlank(refreshToken)) return null;
  if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return null;
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === 'string')) return null;

  return { clientId, subject, accessToken, refreshToken, expiresAtMs, scopes };
}

function parseAccounts(value: unknown): StoredChatGPTAccounts {
  const listed = prop(value, 'registrations');
  // One registration per account: a later entry for the same subject replaces an earlier one.
  const bySubject = new Map<string, ChatGPTRegistration>();

  for (const registration of (Array.isArray(listed) ? listed : []).map(parseRegistration)) {
    if (registration !== null) bySubject.set(registration.subject, registration);
  }

  const registrations = [...bySubject.values()];
  const lastSubject = prop(value, 'lastSubject');
  const session = parseSession(prop(value, 'session'));
  // A session is used only with the client its account registered: never one account's tokens with another's client.
  const owner = session === null ? undefined : registrations.find((registration) => registration.subject === session.subject);

  return {
    registrations,
    lastSubject: nonBlank(lastSubject) && registrations.some((registration) => registration.subject === lastSubject) ? lastSubject : null,
    session: session !== null && owner?.clientId === session.clientId ? session : null,
  };
}

/** Reads the keychain value back. Anything unreadable, or of an unknown version, holds nothing usable. */
export function parseStoredAccounts(text: string | null): StoredItem {
  if (text === null) return { kind: 'none' };

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return { kind: 'none' };
  }

  const version = prop(value, 'version');

  if (version === FORMAT_VERSION) return { kind: 'accounts', accounts: parseAccounts(value) };

  const clientId = prop(value, 'clientId');
  const refreshToken = prop(value, 'refreshToken');

  if (version === LEGACY_FORMAT_VERSION && nonBlank(clientId) && nonBlank(refreshToken)) {
    return { kind: 'legacy', clientId, refreshToken };
  }

  return { kind: 'none' };
}
