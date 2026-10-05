import { hasExpectedIdTokenClaims } from './id-token';
import { OPENAI_ISSUER } from './openai-auth.constants';

const NOW_SECONDS = 1_790_000_000;
const EXPECTED = { clientId: 'oaiapp_test', nonce: 'nonce-1', nowSeconds: NOW_SECONDS };

const base64Url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const idToken = (claims: Record<string, unknown>) =>
  `${base64Url(JSON.stringify({ alg: 'RS256' }))}.${base64Url(JSON.stringify(claims))}.signature`;

const validClaims = { iss: OPENAI_ISSUER, aud: 'oaiapp_test', nonce: 'nonce-1', exp: NOW_SECONDS + 3600, sub: 'user-1', email: 'é@example.com' };

describe('hasExpectedIdTokenClaims', () => {
  it('accepts a token from OpenAI, for this client, carrying this attempt’s nonce, not yet expired', () => {
    expect(hasExpectedIdTokenClaims(idToken(validClaims), EXPECTED)).toBe(true);
  });

  it('accepts an audience list that names this client', () => {
    expect(hasExpectedIdTokenClaims(idToken({ ...validClaims, aud: ['other', 'oaiapp_test'] }), EXPECTED)).toBe(true);
  });

  it.each([
    ['another issuer', { iss: 'https://evil.example' }],
    ['another client', { aud: 'oaiapp_other' }],
    ['another attempt’s nonce', { nonce: 'nonce-2' }],
    ['no nonce', { nonce: undefined }],
    ['an expiry past the clock skew', { exp: NOW_SECONDS - 600 }],
    ['no expiry', { exp: undefined }],
  ])('refuses a token with %s', (_case, override) => {
    expect(hasExpectedIdTokenClaims(idToken({ ...validClaims, ...override }), EXPECTED)).toBe(false);
  });

  it.each([
    ['two segments', 'a.b'],
    ['a payload that is not base64', 'a.%%%.c'],
    ['a payload that is not JSON', `a.${base64Url('not json')}.c`],
  ])('refuses a token with %s', (_case, token) => {
    expect(hasExpectedIdTokenClaims(token, EXPECTED)).toBe(false);
  });
});
