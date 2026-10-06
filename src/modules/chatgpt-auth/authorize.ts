import { AuthRequest, CodeChallengeMethod, ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import type { LoopbackCallback, LoopbackCallbackParams, LoopbackOutcome, StartLoopbackCallback } from './loopback-callback';
import { OPENAI_API_RESOURCE, OPENAI_AUTH_ENDPOINTS } from './openai-auth.constants';

export interface AuthorizeRequest {
  /** `dynamic_agent_client` for a first registration, else the account's saved issued client. */
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly state: string;
  readonly nonce: string;
  readonly hostId: string;
  /** Sent on a first registration only. */
  readonly agentNameHint: string | null;
  /** Sent on a reauthorization only. */
  readonly loginHint: string | null;
  /** `consent` only after the account declined plan use; never on an ordinary sign-in. */
  readonly prompt: 'consent' | null;
}

export type AuthorizeResult =
  | {
      readonly type: 'success';
      readonly code: string;
      readonly state: string | null;
      /** The issued client the callback named; a reauthorization may omit it. */
      readonly clientId: string | null;
      readonly codeVerifier: string;
      /** The exact loopback redirect this attempt used, which the code exchange must repeat. */
      readonly redirectUri: string;
    }
  | { readonly type: 'cancelled' }
  | { readonly type: 'error'; readonly error: string };

export type Authorize = (request: AuthorizeRequest) => Promise<AuthorizeResult>;

const stringParam = (params: LoopbackCallbackParams, key: string) => {
  const value = params[key];

  return value !== undefined && value !== '' ? value : null;
};

function readCallback(params: LoopbackCallbackParams, codeVerifier: string | undefined, redirectUri: string): AuthorizeResult {
  const error = stringParam(params, 'error');

  if (error !== null) return { type: 'error', error };

  const code = stringParam(params, 'code');

  if (code === null || codeVerifier === undefined) return { type: 'error', error: 'missing_code' };

  return { type: 'success', code, state: stringParam(params, 'state'), clientId: stringParam(params, 'client_id'), codeVerifier, redirectUri };
}

function readOutcome(outcome: LoopbackOutcome, codeVerifier: string | undefined, redirectUri: string): AuthorizeResult {
  switch (outcome.type) {
    case 'callback':
      return readCallback(outcome.params, codeVerifier, redirectUri);
    case 'cancelled':
      return { type: 'cancelled' };
    case 'timeout':
      return { type: 'error', error: 'callback_timeout' };
    case 'failed':
      return { type: 'error', error: 'callback_failed' };
  }
}

/**
 * Waits for OpenAI's redirect to reach the listener, or for the sheet to close. The sheet watches for no URL, since an
 * auth session cannot catch an http redirect, so it is dismissed here once the callback has arrived.
 */
async function waitForCallback(url: string, listener: LoopbackCallback): Promise<LoopbackOutcome | 'unavailable'> {
  // A private session shares no cookies with Safari and keeps none, so no chatgpt.com login outlives a sign-out.
  const sheet = WebBrowser.openAuthSessionAsync(url, null, { preferEphemeralSession: true }).then(
    () => 'closed' as const,
    () => 'unavailable' as const,
  );
  const first = await Promise.race([listener.outcome, sheet]);

  if (first !== 'closed' && first !== 'unavailable') {
    WebBrowser.dismissAuthSession();
    await sheet;

    return first;
  }

  // A callback that landed as the sheet closed still counts.
  await listener.stop();

  const outcome = await listener.outcome;

  return outcome.type === 'callback' || first === 'closed' ? outcome : 'unavailable';
}

/** Runs OpenAI's authorize page in an iOS auth session against a one-time loopback listener. */
export function createAuthorize(startLoopbackCallback: StartLoopbackCallback): Authorize {
  return async function authorizeInBrowser(request) {
    const listener = await startLoopbackCallback({ state: request.state });

    try {
      const auth = new AuthRequest({
        clientId: request.clientId,
        redirectUri: listener.redirectUri,
        scopes: [...request.scopes],
        state: request.state,
        responseType: ResponseType.Code,
        usePKCE: true,
        codeChallengeMethod: CodeChallengeMethod.S256,
        extraParams: {
          nonce: request.nonce,
          resource: OPENAI_API_RESOURCE,
          ext_agent_host_id: request.hostId,
          ...(request.agentNameHint === null ? {} : { agent_name_hint: request.agentNameHint }),
          ...(request.loginHint === null ? {} : { login_hint: request.loginHint }),
          ...(request.prompt === null ? {} : { prompt: request.prompt }),
        },
      });
      const url = await auth.makeAuthUrlAsync({ authorizationEndpoint: OPENAI_AUTH_ENDPOINTS.authorization });
      const outcome = await waitForCallback(url, listener);

      if (outcome === 'unavailable') return { type: 'error', error: 'browser_unavailable' };

      return readOutcome(outcome, auth.codeVerifier, listener.redirectUri);
    } finally {
      await listener.stop();
    }
  };
}
