// OpenAI's OAuth contract for ChatGPT plan usage, as documented on 2026-10-04:
// https://auth.openai.com/.well-known/openid-configuration and
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in. The README's probe section lists each source.

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

/** Where the sign-in browser returns to the app: app.json's `scheme`, path `auth/callback`. Also the default redirect. */
export const APP_CALLBACK_URL = 'justcalorie://auth/callback';
