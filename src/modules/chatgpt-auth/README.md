# `modules/chatgpt-auth`

Sign in with ChatGPT: the user's own OpenAI OAuth sign-in (a public client with PKCE), its tokens in the iOS
Keychain, refresh, and sign-out. **This is the only code that touches a ChatGPT token or the Keychain.** It imports
no feature, and lint keeps `expo-secure-store` and `expo-auth-session` inside it.

## Public API (`index.ts`)

- `useChatGPTSessionStatus()` is `'loading' | 'signed-out' | 'signing-in' | 'signing-out' | 'signed-in'`. The first render
  reads the Keychain; `'signing-out'` lasts until OpenAI and the Keychain have let go.
- `signInWithChatGPT()` opens OpenAI's sign-in in an iOS auth session and resolves `'signed-in'` or `'cancelled'`.
- `signOutOfChatGPT()` stops handing out the token at once, waits for a sign-in or refresh in flight, revokes the
  refresh token at OpenAI, then deletes the session from the Keychain. It resolves `{ revoked }`; `revoked: false`
  means OpenAI did not confirm, and the device is signed out anyway. If the Keychain item cannot be deleted and
  OpenAI did not confirm the revocation, the device is still signed in, so the session is put back and the call
  throws `failed`; once OpenAI has confirmed it, its tokens are never handed out again: an item the Keychain will not delete is rewritten
  as expired, so the next launch refreshes it first and OpenAI refuses it. Only a Keychain that refuses both the delete
  and the rewrite keeps a usable item, which the next launch uses until it nears expiry. Taps that arrive together
  share one sign-out, as they share one sign-in. A sign-in asked for while a sign-out is under way waits for it, so
  the sign-out never deletes the new session's item (qa f-463b39); each waits only for the other already under way
  when it was asked for.
- `getChatGPTAccessToken()` is the signed-in user's access token, refreshed first when it is within five minutes of
  expiry, or `null` when nobody is signed in on this device. A refresh that cannot reach OpenAI keeps a token that
  has not expired yet. `modules/calorie-estimate` is its one caller.
- `rejectChatGPTAccessToken(token)` is for a token OpenAI refused (a 401) although it had not expired: the next
  `getChatGPTAccessToken` refreshes before handing one out, and a refresh OpenAI refuses ends the session.
- `openChatGPTUsageSettings()` opens <https://chatgpt.com/settings/usage>, where a user reviews and limits what apps
  spend of their plan.
- `ChatGPTAuthError` is the only error these throw. Switch on `kind`:

  | `kind` | When |
  | --- | --- |
  | `unavailable` | the build has no client ID; no browser opens |
  | `denied` | the user declined on OpenAI's consent page |
  | `plan-not-allowed` | the user signed in but did not allow ChatGPT plan use; nothing is kept |
  | `network` | OpenAI's token endpoint did not answer, or not within 30 s; on a refresh, also HTTP 408, 429 or 5xx |
  | `failed` | anything else: a code exchange answered with any non-2xx, a callback for another attempt or client, a bad token response, a Keychain error |

  Messages are fixed text. No token, code or response body reaches one, and the module logs nothing.

## Whose account pays

Every token comes from the signing-in user's own consent and lives only in that device's Keychain. A client ID is a
public identifier that grants nothing by itself.

| Build | Client | Redirect sent to OpenAI |
| --- | --- | --- |
| production | `CHATGPT_CLIENT_ID`, an app-wide client OpenAI provisions | `justcalorie://auth/callback` |
| development | `CHATGPT_DEV_CLIENT_ID`, else `CHATGPT_CLIENT_ID` | `CHATGPT_DEV_REDIRECT_URI`, else the app callback |

`app.config.js` includes `CHATGPT_DEV_CLIENT_ID`, `CHATGPT_DEV_REDIRECT_URI` and `OPENAI_API_KEY` only in the config
the dev server serves: `bun start` sets `JUST_CALORIE_DEV_SERVER=1`, and `NODE_ENV` must also be `development`.
`NODE_ENV` alone is not enough, because `expo config` sets it to `development` too, and `eas update` builds its
manifest with `expo config`. Any other config also drops a `CHATGPT_CLIENT_ID` equal to `CHATGPT_DEV_CLIENT_ID`,
because a native build reads `.env` and would otherwise embed the owner's client (`src/config/app-config.test.ts`;
measured 2026-10-05: before this, a native build embedded the owner's client whenever `.env` set both to it, and an
`eas update` run from a shell or EAS environment that held these variables would publish all three; after it, 0
hits on each path). The app also ignores a loopback redirect outside a
development bundle. A session another client signed in, such as a development build's on the same phone, is deleted
on load and never used, even by a build that has no client of its own yet.

Any token OpenAI issued that the app will not keep is revoked: a sign-in that grants no plan use, fails the ID-token
check or cannot be stored, a refresh that lands after the session was replaced or ended or that took plan use away
(qa f-f97276), and a stored session that belongs to another client.

## The Keychain

- The Keychain is read once, on first use. A read that fails (a locked phone) is retried on the next call rather than
  remembered as signed out.
- One item, `chatgpt.session`, holds the client ID, both tokens, the expiry and the granted scopes as one JSON value,
  so a crash cannot leave half a token pair. It carries a format version; an item of another version reads as no
  session.
- `chatgpt.host-id` holds this install's opaque `urn:uuid:` host ID, which OpenAI's plan-usage flow asks for on every
  sign-in. It is not a credential, and sign-out keeps it, as OpenAI's docs ask.
- Both are `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: readable only while the phone is unlocked, never restored onto another
  device from a backup. The iOS Keychain outlives an uninstall, so a reinstall on the same phone can still be signed
  in.
- No config plugin is added. `expo-secure-store`'s only adds a Face ID purpose string, which nothing here uses, and
  `expo-web-browser`'s does nothing on iOS.

## External constraints (probed 2026-10-04)

Each conclusion is a ledger finding on workstream `sign-in-with-chatgpt`, with its source.

- **Availability.** ChatGPT plan usage is self-serve only for open-source and locally run apps. A closed-source App
  Store app needs OpenAI to select it through the interest form,
  <https://openai.com/form/sign-in-with-chatgpt-interest/> ([quickstart](https://developers.openai.com/siwc/quickstart)).
  **Until it does, a production build has no client: Continue with ChatGPT reports that sign-in is unavailable, and no
  estimate runs.** That form is the one remaining production step.
- **The contract** ([sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
  [token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)): scopes
  `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, `resource=https://api.openai.com/v1`
  on the authorize, exchange and refresh requests, PKCE S256, no secret. Access tokens last an hour; refresh tokens 30
  days and rotate on every refresh, which is why refreshes are serialised. A result without
  `chatgpt.tokens.use.direct` in the granted scopes may not use the plan.
- **The ID token** is checked for issuer, audience, nonce and expiry. Its signature is not, which departs from
  OpenAI's sign-in page (it asks for verification against OpenAI's JWKS): the token arrives straight from the token
  endpoint over TLS, which OpenID Connect Core §3.1.3.7 accepts instead, and the app uses no identity claim from it.
- **The plan route's own shape** (measured 2026-10-04 on the owner's account): `GET /v1/models` answers
  `{ models: [...] }`, and a streamed `response.completed` carries an empty `output`, the message arriving only in
  `response.output_item.done` (`modules/calorie-estimate`).
- **iOS's URL cache** would otherwise write these requests, with their `Authorization` header, and the token
  endpoint's response, with its tokens, into `Library/Caches/<bundle id>/Cache.db`, an SQLite file (measured). A
  request header does not stop it, so `plugins/with-no-http-cache.js` gives the app a zero-capacity cache at launch.
- **The self-serve client is bound to the user who registered it** and accepts only a loopback redirect,
  `http://127.0.0.1:<port>/auth/callback`; it refuses `justcalorie://` with `param: redirect_uri` (measured). So the
  owner's own client is a development client, and per-install self-registration would need an in-app HTTP listener
  (a native module) and OpenAI's permission, which a closed-source app does not have.

## Signing in on the simulator

The development client's only redirect is the loopback, and on the simulator `127.0.0.1` is the Mac. So:

1. `node scripts/chatgpt-loopback-relay.mjs` (it reads `CHATGPT_DEV_REDIRECT_URI` from `.env`);
2. tap Continue with ChatGPT and sign in.

OpenAI redirects to the relay, which redirects the auth session to `justcalorie://auth/callback`; the app redeems the
code with its own PKCE verifier, which the relay never sees. This works on the simulator only: on an iPhone,
`127.0.0.1` is the phone.

## Tests

Every collaborator is injected through `createChatGPTAuth`: an in-memory Keychain, a routed fake fetch, a fake
browser and a clock. `authorize.test.ts` runs the real `AuthRequest` over node's crypto to check the authorize URL
OpenAI receives.
