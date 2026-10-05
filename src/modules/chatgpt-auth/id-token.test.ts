import { readIdTokenIdentity } from './id-token';
import { OPENAI_ISSUER } from './openai-auth.constants';

const NOW_SECONDS = 1_790_000_000;
const EXPECTED = { clientId: 'oaiapp_test', nonce: 'nonce-1', nowSeconds: NOW_SECONDS };

const base64Url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const idToken = (claims: Record<string, unknown>) =>
  `${base64Url(JSON.stringify({ alg: 'RS256' }))}.${base64Url(JSON.stringify(claims))}.signature`;

const validClaims = { iss: OPENAI_ISSUER, aud: 'oaiapp_test', nonce: 'nonce-1', exp: NOW_SECONDS + 3600, sub: 'user-1', email: 'me@example.com' };

describe('readIdTokenIdentity', () => {
  it('reads the account from a token by OpenAI, for this client, carrying this attempt’s nonce, not yet expired', () => {
    expect(readIdTokenIdentity(idToken(validClaims), EXPECTED)).toEqual({ subject: 'user-1', email: 'me@example.com' });
  });

  it('accepts an audience list that names this client', () => {
    expect(readIdTokenIdentity(idToken({ ...validClaims, aud: ['other', 'oaiapp_test'] }), EXPECTED)).not.toBeNull();
  });

  it('reads an account with no email, which only labels it', () => {
    expect(readIdTokenIdentity(idToken({ ...validClaims, email: undefined }), EXPECTED)).toEqual({ subject: 'user-1', email: null });
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example' }],
    ['another client', { aud: 'oaiapp_other' }],
    ['another attempt’s nonce', { nonce: 'nonce-2' }],
    ['no nonce', { nonce: undefined }],
    ['an expiry past the clock skew', { exp: NOW_SECONDS - 600 }],
    ['no expiry', { exp: undefined }],
    ['no subject', { sub: undefined }],
    ['a blank subject', { sub: ' ' }],
  ])('refuses a token with %s', (_case, override) => {
    expect(readIdTokenIdentity(idToken({ ...validClaims, ...override }), EXPECTED)).toBeNull();
  });

  it.each([
    ['two segments', 'a.b'],
    ['a payload that is not base64', 'a.%%%.c'],
    ['a payload that is not JSON', `a.${base64Url('not json')}.c`],
  ])('refuses a token with %s', (_case, token) => {
    expect(readIdTokenIdentity(token, EXPECTED)).toBeNull();
  });
});
