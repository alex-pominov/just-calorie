import type { StoredChatGPTSession } from './chatgpt-auth.types';

// Bump when the shape changes: an item an older build wrote then reads as no session, and the user signs in again.
const SESSION_FORMAT_VERSION = 1;

function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** The one keychain value for a session. One item, so a crash can never leave half a token pair behind. */
export function serializeSession(session: StoredChatGPTSession): string {
  return JSON.stringify({ version: SESSION_FORMAT_VERSION, ...session });
}

/** Reads a keychain value back. Anything unreadable, or written by another format version, is no session. */
export function parseStoredSession(text: string | null): StoredChatGPTSession | null {
  if (text === null) return null;

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }

  const clientId = prop(value, 'clientId');
  const accessToken = prop(value, 'accessToken');
  const refreshToken = prop(value, 'refreshToken');
  const expiresAtMs = prop(value, 'expiresAtMs');
  const scopes = prop(value, 'scopes');

  if (prop(value, 'version') !== SESSION_FORMAT_VERSION) return null;
  if (!nonBlank(clientId) || !nonBlank(accessToken) || !nonBlank(refreshToken)) return null;
  if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return null;
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === 'string')) return null;

  return { clientId, accessToken, refreshToken, expiresAtMs, scopes };
}
