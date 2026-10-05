import { OPENAI_ISSUER } from './openai-auth.constants';

const CLOCK_SKEW_SECONDS = 300;

/** Who signed in, from a validated ID token. `subject` keys the account; `email` only helps the user recognise it. */
export interface IdTokenIdentity {
  readonly subject: string;
  readonly email: string | null;
}

function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

function decodePayload(token: string): unknown {
  const parts = token.split('.');

  if (parts.length !== 3 || parts[1] === undefined) return null;

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');

  try {
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

const audienceIncludes = (audience: unknown, clientId: string) =>
  audience === clientId || (Array.isArray(audience) && audience.includes(clientId));

// The signature is not checked: the token came straight from the token endpoint over TLS, which OpenID Connect
// Core 1.0 §3.1.3.7 accepts in place of a signature check. The README states where this departs from OpenAI's page.
/** The identity in an ID token that is OpenAI's, for this client and this attempt's nonce, and not expired; else null. */
export function readIdTokenIdentity(
  token: string,
  expected: { readonly clientId: string; readonly nonce: string; readonly nowSeconds: number },
): IdTokenIdentity | null {
  const claims = decodePayload(token);
  const expiry = prop(claims, 'exp');
  const subject = prop(claims, 'sub');
  const email = prop(claims, 'email');
  const valid =
    prop(claims, 'iss') === OPENAI_ISSUER &&
    audienceIncludes(prop(claims, 'aud'), expected.clientId) &&
    prop(claims, 'nonce') === expected.nonce &&
    typeof expiry === 'number' &&
    expiry > expected.nowSeconds - CLOCK_SKEW_SECONDS &&
    nonBlank(subject);

  return valid ? { subject, email: nonBlank(email) ? email : null } : null;
}
