// OpenAI's OAuth contract for ChatGPT plan usage in an open-source app, as documented on 2026-10-05:
// https://auth.openai.com/.well-known/openid-configuration and
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in. The README lists each source.

export const OPENAI_ISSUER = 'https://auth.openai.com';

export const OPENAI_AUTH_ENDPOINTS = {
  authorization: `${OPENAI_ISSUER}/api/accounts/authorize`,
  token: `${OPENAI_ISSUER}/api/accounts/oauth/token`,
  revocation: `${OPENAI_ISSUER}/api/accounts/oauth/revoke`,
} as const;

/** Without this scope in the GRANTED set, a token may not spend the user's ChatGPT plan. */
export const PLAN_USAGE_SCOPE = 'chatgpt.tokens.use.direct';

/** Identity scopes, then the three that ChatGPT plan usage needs. */
export const CHATGPT_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', PLAN_USAGE_SCOPE] as const;

/** The resource every authorize, code-exchange and refresh request names. */
export const OPENAI_API_RESOURCE = 'https://api.openai.com/v1';

/** The first-time registration entrypoint: never the client ID to save, exchange, refresh or revoke with. */
export const DYNAMIC_REGISTRATION_CLIENT_ID = 'dynamic_agent_client';

/** `agent_name_hint` on a first registration: the app's actual name, the same on every install. */
export const AGENT_NAME = 'Just Calorie';
