import type { StoredChatGPTAccounts, StoredChatGPTSession } from './chatgpt-auth.types';
import { NO_ACCOUNTS, parseStoredAccounts, serializeAccounts } from './stored-session';

const SESSION: StoredChatGPTSession = {
  clientId: 'oaiapp_a',
  subject: 'user-a',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAtMs: 1_790_000_000_000,
  scopes: ['openid', 'chatgpt.tokens.use.direct'],
};

const ACCOUNTS: StoredChatGPTAccounts = {
  registrations: [
    { clientId: 'oaiapp_a', subject: 'user-a', email: 'a@example.com' },
    { clientId: 'oaiapp_b', subject: 'user-b', email: null },
  ],
  lastSubject: 'user-a',
  session: SESSION,
};

const REGISTRATION_A_FIXTURE = { clientId: 'oaiapp_a', subject: 'user-a', email: 'a@example.com' };

const withChange = (change: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(serializeAccounts(ACCOUNTS)), ...change });

describe('the stored accounts', () => {
  it('reads back exactly what was written', () => {
    expect(parseStoredAccounts(serializeAccounts(ACCOUNTS))).toEqual({ kind: 'accounts', accounts: ACCOUNTS });
  });

  it('carries format version 2, so a later shape can tell an old item apart', () => {
    expect(JSON.parse(serializeAccounts(ACCOUNTS))).toMatchObject({ version: 2 });
  });

  it('reads a signed-out item as its registrations and no session', () => {
    const signedOut = { ...ACCOUNTS, session: null };

    expect(parseStoredAccounts(serializeAccounts(signedOut))).toEqual({ kind: 'accounts', accounts: signedOut });
  });

  it('never pairs a session with another account’s client', () => {
    const text = withChange({ session: { ...SESSION, clientId: 'oaiapp_b' } });

    expect(parseStoredAccounts(text)).toEqual({ kind: 'accounts', accounts: { ...ACCOUNTS, session: null } });
  });

  it('reads back a registration marked as having declined plan use', () => {
    const declined = { ...ACCOUNTS, registrations: [{ ...REGISTRATION_A_FIXTURE, planDeclined: true as const }], session: null };

    expect(parseStoredAccounts(serializeAccounts(declined))).toEqual({ kind: 'accounts', accounts: declined });
  });

  it('drops a session whose account has no registration', () => {
    const text = withChange({ registrations: [ACCOUNTS.registrations[1]], lastSubject: 'user-b' });

    expect(parseStoredAccounts(text)).toMatchObject({ kind: 'accounts', accounts: { session: null } });
  });

  it('keeps one registration per account, the later one', () => {
    const text = withChange({
      registrations: [...ACCOUNTS.registrations, { clientId: 'oaiapp_a2', subject: 'user-a', email: 'a@example.com' }],
    });

    expect(parseStoredAccounts(text)).toMatchObject({
      kind: 'accounts',
      accounts: { registrations: [{ clientId: 'oaiapp_a2', subject: 'user-a' }, { clientId: 'oaiapp_b' }], session: null },
    });
  });

  it.each([
    ['a blank client', { clientId: '', subject: 'user-c' }],
    ['no subject', { clientId: 'oaiapp_c' }],
    ['a value that is not an object', 'oaiapp_c'],
  ])('ignores a registration with %s', (_case, registration) => {
    const text = withChange({ registrations: [...ACCOUNTS.registrations, registration] });

    expect(parseStoredAccounts(text)).toEqual({ kind: 'accounts', accounts: ACCOUNTS });
  });

  it.each([
    ['a blank access token', { accessToken: '' }],
    ['no refresh token', { refreshToken: undefined }],
    ['an expiry that is not a number', { expiresAtMs: 'soon' }],
    ['scopes that are not strings', { scopes: [1] }],
  ])('reads a session with %s as signed out, keeping the registrations', (_case, change) => {
    const text = withChange({ session: { ...SESSION, ...change } });

    expect(parseStoredAccounts(text)).toEqual({ kind: 'accounts', accounts: { ...ACCOUNTS, session: null } });
  });

  it('forgets a last account that has no registration', () => {
    expect(parseStoredAccounts(withChange({ lastSubject: 'user-z' }))).toMatchObject({ accounts: { lastSubject: null } });
  });

  it('hands back a version-1 session’s client and refresh token, so it can be ended at OpenAI', () => {
    const legacy = JSON.stringify({ version: 1, clientId: 'oaiapp_app_wide', accessToken: 'a', refreshToken: 'r', expiresAtMs: 1, scopes: [] });

    expect(parseStoredAccounts(legacy)).toEqual({ kind: 'legacy', clientId: 'oaiapp_app_wide', refreshToken: 'r' });
  });

  it.each([
    ['nothing stored', null],
    ['text that is not JSON', 'not json'],
    ['an unknown format version', withChange({ version: 3 })],
    ['no version', JSON.stringify(ACCOUNTS)],
    ['a version-1 item with no refresh token', JSON.stringify({ version: 1, clientId: 'oaiapp_app_wide' })],
  ])('reads %s as nothing usable', (_case, text) => {
    expect(parseStoredAccounts(text)).toEqual({ kind: 'none' });
  });

  it('has nothing in the empty accounts', () => {
    expect(NO_ACCOUNTS).toEqual({ registrations: [], lastSubject: null, session: null });
  });
});
