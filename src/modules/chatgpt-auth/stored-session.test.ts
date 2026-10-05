import type { StoredChatGPTSession } from './chatgpt-auth.types';
import { parseStoredSession, serializeSession } from './stored-session';

const SESSION: StoredChatGPTSession = {
  clientId: 'oaiapp_test',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAtMs: 1_790_000_000_000,
  scopes: ['openid', 'chatgpt.tokens.use.direct'],
};

describe('the stored session', () => {
  it('reads back exactly what was written', () => {
    expect(parseStoredSession(serializeSession(SESSION))).toEqual(SESSION);
  });

  it('carries a format version, so a later shape can tell an old item apart', () => {
    expect(JSON.parse(serializeSession(SESSION))).toMatchObject({ version: 1 });
  });

  it.each([
    ['nothing stored', null],
    ['text that is not JSON', 'not json'],
    ['another format version', JSON.stringify({ ...SESSION, version: 2 })],
    ['no version', JSON.stringify(SESSION)],
    ['a blank access token', serializeSession({ ...SESSION, accessToken: '' })],
    ['no refresh token', JSON.stringify({ ...JSON.parse(serializeSession(SESSION)), refreshToken: undefined })],
    ['an expiry that is not a number', JSON.stringify({ ...JSON.parse(serializeSession(SESSION)), expiresAtMs: 'soon' })],
    ['scopes that are not strings', JSON.stringify({ ...JSON.parse(serializeSession(SESSION)), scopes: [1] })],
  ])('reads %s as no session', (_case, text) => {
    expect(parseStoredSession(text)).toBeNull();
  });
});
