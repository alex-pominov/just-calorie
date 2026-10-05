import { AuthRequest, CodeChallengeMethod, ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { APP_CALLBACK_URL, OPENAI_API_RESOURCE, OPENAI_AUTH_ENDPOINTS } from './openai-auth.constants';

export interface AuthorizeRequest {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly state: string;
  readonly nonce: string;
  readonly hostId: string;
}

export type AuthorizeResult =
  | {
      readonly type: 'success';
      readonly code: string;
      readonly state: string | null;
      readonly clientId: string | null;
      readonly codeVerifier: string;
    }
  | { readonly type: 'cancelled' }
  | { readonly type: 'error'; readonly error: string };

const stringParam = (params: Record<string, string>, key: string) => {
  const value = params[key];

  return typeof value === 'string' && value !== '' ? value : null;
};

// The session waits for APP_CALLBACK_URL even when OpenAI is sent a loopback redirect: in development
// scripts/chatgpt-loopback-relay.mjs answers that loopback by redirecting the browser to APP_CALLBACK_URL.
/** Runs OpenAI's authorize page in an iOS auth session and returns the code with its PKCE verifier. */
export async function authorizeInBrowser(request: AuthorizeRequest): Promise<AuthorizeResult> {
  const auth = new AuthRequest({
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    scopes: [...request.scopes],
    state: request.state,
    responseType: ResponseType.Code,
    usePKCE: true,
    codeChallengeMethod: CodeChallengeMethod.S256,
    extraParams: { nonce: request.nonce, resource: OPENAI_API_RESOURCE, ext_agent_host_id: request.hostId },
  });
  const url = await auth.makeAuthUrlAsync({ authorizationEndpoint: OPENAI_AUTH_ENDPOINTS.authorization });

  let session: WebBrowser.WebBrowserAuthSessionResult;

  try {
    session = await WebBrowser.openAuthSessionAsync(url, APP_CALLBACK_URL);
  } catch {
    return { type: 'error', error: 'browser_unavailable' };
  }

  if (session.type !== 'success') return { type: 'cancelled' };

  const result = auth.parseReturnUrl(session.url);

  if (result.type === 'error') return { type: 'error', error: result.error?.code ?? 'unknown' };
  if (result.type !== 'success') return { type: 'error', error: 'unknown' };

  const code = stringParam(result.params, 'code');

  if (code === null || auth.codeVerifier === undefined) return { type: 'error', error: 'missing_code' };

  return {
    type: 'success',
    code,
    state: stringParam(result.params, 'state'),
    clientId: stringParam(result.params, 'client_id'),
    codeVerifier: auth.codeVerifier,
  };
}
