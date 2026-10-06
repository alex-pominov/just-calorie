# `modules/chatgpt-auth`

Sign in with ChatGPT, as OpenAI documents it for open-source apps: each account's first sign-in on a phone
registers that account's own OAuth client, its tokens live in the iOS Keychain, and refresh and sign-out use that
client. **This is the only code that touches a ChatGPT token or the Keychain.** It imports no feature, and lint keeps
`expo-secure-store` and `expo-auth-session` inside it. No build carries a client, a key or any setting for it.

## Public API (`index.ts`)

- `useChatGPTSessionStatus()` is `'loading' | 'signed-out' | 'signing-in' | 'signing-out' | 'signed-in'`. The first render
  reads the Keychain; `'signing-out'` lasts until OpenAI and the Keychain have let go.
- `useHasSavedChatGPTAccount()` is true once an account has registered on this phone. A plain sign-in then reuses
  that account's client, and the UI can offer to add another account.
- `signInWithChatGPT(options?)` opens OpenAI's sign-in in a private iOS auth session and resolves `'signed-in'` or
  `'cancelled'`. It reuses the account signed in last, or registers the first one. `{ newAccount: true }` registers
  another ChatGPT account instead.
- `signOutOfChatGPT()` stops handing out the token at once and waits for a sign-in or refresh in flight. It then clears
  every token from the Keychain first, so a phone quit mid-sign-out relaunches signed out, and only then revokes the
  refresh token, which it now holds in memory alone, at OpenAI with the account's own client. The account's
  registration and this install's host ID stay. A revocation OpenAI could not answer (no response, or a 5xx) is
  retried after 1 s and then 2 s. Each attempt is limited to 4 s, so the whole revocation ends within 15 s, still
  reading as signing out. A 4xx is final (accounts and sessions, "End the renewable session"; qa f-3d8e7d). It resolves
  `{ revoked }`; `revoked: false` means OpenAI did not confirm, and the device is signed out anyway. If the Keychain will
  not take the signed-out item and OpenAI did not confirm the revocation, the device is still signed in, so the session
  is put back and the call throws `failed`. Once OpenAI has confirmed it, its tokens are never handed out again: an
  item the Keychain will not rewrite is deleted, registration and all, and one it will not delete either is rewritten
  as expired, so the next launch refreshes it first and OpenAI refuses it. Only a Keychain that refuses every write and
  the delete keeps a usable item, which the next launch uses until it nears expiry. Taps that arrive together share
  one sign-out, as they share one sign-in. A sign-in asked for while a sign-out is under way waits for it, so the
  sign-out never overwrites the new session (qa f-463b39); each waits only for the other already under way when it
  was asked for. Last, still reading as signing out, it clears the openai.com and chatgpt.com cookies (below).
- `getChatGPTAccessToken()` is the signed-in user's access token, refreshed first when it is within five minutes of
  expiry, or `null` when nobody is signed in on this device. A refresh that cannot reach OpenAI keeps a token that
  has not expired yet. `modules/calorie-estimate` is its one caller.
- `rejectChatGPTAccessToken(token)` is for a token OpenAI refused (a 401) although it had not expired: the next
  `getChatGPTAccessToken` refreshes before handing one out, and a refresh OpenAI refuses ends the session.
- `openChatGPTUsageSettings()` opens <https://chatgpt.com/settings/usage>, where a user reviews and limits what apps
  spend of their plan, in the default browser. An in-app browser would keep a chatgpt.com login among Just Calorie's
  own website data, out of a sign-out's reach (backlog 17, the Manager's ruling of 2026-10-05).
- `ChatGPTAuthError` is the only error these throw. Switch on `kind`:

  | `kind` | When |
  | --- | --- |
  | `unavailable` | the build has no sign-in callback listener (`modules/loopback-callback`), such as Expo Go; no browser opens |
  | `denied` | the user declined on OpenAI's consent page |
  | `plan-not-allowed` | the user signed in but did not allow ChatGPT plan use; no token is kept, but the account's client is, marked declined, so the next sign-in reuses it and asks for consent again |
  | `another-account` | a saved account's sign-in was answered by another ChatGPT account (another `sub`, or a callback naming another client); nothing is replaced, and the copy points at Use a different ChatGPT account |
  | `network` | OpenAI's token endpoint did not answer, or not within 30 s; on a refresh, also HTTP 408, 429 or 5xx |
  | `failed` | anything else: no callback within 5 minutes, a callback for another attempt, a first registration whose callback names no issued client, a code exchange answered with any non-2xx, a bad token response, a Keychain error |

  Messages are fixed text. No token, code or response body reaches one, and the module logs nothing.

## How a sign-in runs

OpenAI's pages are cited by section; each was read on 2026-10-05. "Sign-in" is
<https://developers.openai.com/siwc/token-sharing-open-source/sign-in>, "accounts and sessions" is
<https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions>, and "errors and recovery" is
<https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery>.

1. **The listener first.** A one-time HTTP listener starts on the phone's `127.0.0.1`, through
   `loopback-callback.ts` over `modules/loopback-callback`. OpenAI accepts only
   `http://127.0.0.1:<port>/auth/callback`, "only the port may vary", and asks to "start the listener before opening
   the browser" (sign-in, §2). It tries port 1455 and takes any free port when that one is busy. The redirect sent is
   built from the port it actually bound.
2. **The authorize request** (sign-in, §2) carries the plan scopes, `resource`, a fresh `state`, `nonce` and PKCE S256,
   and this install's `ext_agent_host_id`. A **first registration** sends `client_id=dynamic_agent_client` and
   `agent_name_hint=Just Calorie`. A **saved account** sends its own issued client and `login_hint` with its email,
   and no agent name. It sends no `id_token_hint`, because sign-out deletes the ID token.
3. **The callback.** The auth sheet watches for no URL, since an auth session cannot catch an `http` redirect. The
   listener answers OpenAI's redirect with a page saying the sheet can be closed, and the sheet is then dismissed. A
   user who closes the sheet cancels the sign-in. The listener closes on every path.

   The sheet is a **private session** (`preferEphemeralSession`, iOS's `prefersEphemeralWebBrowserSession`). It shares
   no cookies with Safari and keeps none, so the user types their ChatGPT credentials on every sign-in, and no
   chatgpt.com login survives a sign-out to let someone else back in (backlog 17, the Manager's ruling under the
   owner's delegation, 2026-10-05: "i dont want anyone use my account").
4. **The issued client** (sign-in, §3). A first registration must name its issued `oaiapp_` client, and anything else
   is refused before a code is redeemed ("treat registration as incomplete"). A saved account's callback may omit
   it, but may never name another.
5. **The exchange** uses the issued client, the verifier and the same redirect (sign-in, §3).
6. **The ID token** is checked for issuer, audience (the issued client), nonce and expiry, and its `sub` is the
   account (sign-in, §4). A saved account's sign-in answered by another `sub` is refused, and what it issued is
   revoked: "confirm the new ID token's verified identity matches the selected account before replacing credentials"
   (accounts and sessions). Plan use needs `chatgpt.tokens.use.direct` in the **granted** scopes.
7. **Kept, or ended.** The account's registration, `lastSubject` and the session are written as one item. Any token
   OpenAI issued that the app will not keep is revoked with the client it was issued to. That covers a sign-in that
   grants no plan use, fails the ID-token check or cannot be stored; a refresh that lands after the session was
   replaced or ended, or that took plan use away (qa f-f97276); and a version-1 item's session (below).

**Sign-out** follows accounts and sessions, "Sign out": "Stop requests. Attempt End the renewable session … before
clearing the selected account's access, refresh, and ID tokens. Retain its account/client mapping and this host's ID
for a later sign-in." So "signing out or switching back to a saved ChatGPT account does not create a new client".
A client ID on its own grants nothing.

**Sign-out also clears OpenAI's cookies** (backlog 17). The app's own requests, the estimate on api.openai.com and
the token endpoint, leave cookies in the app's shared cookie store (`Library/Cookies/Cookies.binarycookies`): measured
on a phone after a sign-out, `__oailb` (an edge load-balancer JWT with no account claim), `__cflb`, `__cf_bm` and
`oai-did`. None is a credential, but each ties the phone to the session that set it. So once the revocation has ended,
whether or not OpenAI confirmed it, sign-out removes every cookie whose domain is openai.com or chatgpt.com or a
subdomain of either (`openai-cookies.ts`, over `modules/http-cookies`), and no other site's. A store that will not
clear does not fail the sign-out, because the tokens are already gone. A launch that reads the Keychain and finds
nobody signed in clears them too, which finishes a sign-out the app was quit during: its Keychain write already said
signed out, so nothing would offer Sign Out from GPT again (qa f-12d58b).

**Refresh** uses the session's issued client, never `dynamic_agent_client`, and is serialised, because refresh
tokens rotate (accounts and sessions, "Refreshing tokens"). A refresh OpenAI refuses for good clears the tokens and
keeps the registration, so the next sign-in reauthorizes with the saved client (errors and recovery, "Refresh
errors": "Clear unusable tokens and repeat OAuth with the saved issued client ID").

**A declined plan use** (errors and recovery, "ChatGPT plan use isn't enabled"). A validated account whose grant lacks
`chatgpt.tokens.use.direct` has its tokens revoked, and its issued client is saved and marked as declined. The next
Continue repeats OAuth with that client and the complete scope set, and adds `prompt=consent` only because of the mark.
A refresh that comes back without the scope, after the user turned plan use off in ChatGPT's settings, ends the
session and sets the same mark (qa f-39f149). The rule against forcing consent still holds:
"Your app should not force consent on every ordinary sign-in." Each retry therefore reuses one client instead of
registering another. An `access_denied` callback that names an issued client is not kept. It carries no ID token,
so there is no `sub` to key the client by.

**Another account** (accounts and sessions, "Switching ChatGPT accounts"). `{ newAccount: true }` registers through
`dynamic_agent_client` again. Registrations are kept by `sub`, and one account's client is never paired with another's
tokens. An account that registers again replaces its own mapping. The UI has one pill, which reuses the account signed
in last, and one link to add another. There is no account list.

## The Keychain

- **One item, `chatgpt.session`,** holds everything as one JSON value, so a crash can never leave tokens beside the
  wrong client, or half a token pair. Format version 2:

  ```json
  {
    "version": 2,
    "registrations": [{ "clientId": "oaiapp_…", "subject": "<sub>", "email": "… or null", "planDeclined": true }],
    "lastSubject": "<sub>",
    "session": { "clientId": "oaiapp_…", "subject": "<sub>", "accessToken": "…", "refreshToken": "…", "expiresAtMs": 0, "scopes": [] }
  }
  ```

  `session` is `null` when signed out. `planDeclined` is present only after the account declined plan use, and is
  cleared by the next sign-in that grants it. A session whose client is not its account's registered one is read as no
  session. The ID token is not kept, because nothing reuses it.
- **A version-1 item** held a session of the app-wide client earlier builds used. It is revoked with that client and
  deleted on load, and the user registers their own. Any other unreadable item reads as nothing saved.
- `chatgpt.host-id` holds this install's opaque `urn:uuid:` host ID, which every authorize request carries. It is not
  a credential, and sign-out keeps it, as OpenAI's docs ask.
- The Keychain is read once, on first use. A read that fails (a locked phone) is retried on the next call rather than
  remembered as signed out.
- Both items are `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: readable only while the phone is unlocked, and never restored onto
  another device from a backup. The iOS Keychain outlives an uninstall, so a reinstall on the same phone can still be
  signed in.
- Nothing about the client, the account or a token goes anywhere else: not the app config, SQLite, a log or an error.
- No config plugin is added. `expo-secure-store`'s only adds a Face ID purpose string, which nothing here uses, and
  `expo-web-browser`'s does nothing on iOS. The listener needs no Info.plist key, because Safari's auth session, not
  the app, loads the loopback page.
- **Clearing cookies is a local module**, `modules/http-cookies`, whose README says why no package was taken.
- **What earlier builds left outside the app is out of reach.** Before backlog 17 the sign-in sheet shared Safari's
  cookies and ChatGPT settings opened in an in-app browser, so a phone that signed in then may still hold a ChatGPT
  web login in Safari (Settings > Apps > Safari > Advanced > Website Data) or in that browser's data. This build
  neither reads nor clears either.

## External constraints

- **Availability.** ChatGPT plan usage is self-serve for open-source and locally hosted apps
  (<https://developers.openai.com/siwc/token-sharing-open-source>). A paid or remotely hosted app would need OpenAI's
  interest form instead. This repository is open source, so no form or OpenAI-issued client is involved.
- **The contract** (sign-in; [token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)):
  scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`,
  `resource=https://api.openai.com/v1` on the authorize, exchange and refresh requests, PKCE S256, and no secret.
  Access tokens last an hour. Refresh tokens last 30 days and rotate on every refresh.
- **The ID token's signature is not checked.** This departs from sign-in, §4, which asks for verification against
  OpenAI's JWKS. The token arrives straight from the token endpoint over TLS, which OpenID Connect Core §3.1.3.7
  accepts instead, and the app uses only `sub` and `email` from it, to tell accounts apart.
- **A dead client.** A refresh, or a saved account's code exchange, that OpenAI answers with `invalid_client` drops
  that account's registration (errors and recovery, "Invalid client"), so the next Continue registers a new client.
  Only the OAuth `error` code is read from a refusal, never the rest of its body. Any other refusal keeps the client.
- **The plan route's own shape** (measured 2026-10-04 on the owner's account): `GET /v1/models` answers
  `{ models: [...] }`, and a streamed `response.completed` carries an empty `output`, the message arriving only in
  `response.output_item.done` (`modules/calorie-estimate`).
- **iOS's URL cache** would otherwise write these requests, with their `Authorization` header, and the token
  endpoint's response, with its tokens, into `Library/Caches/<bundle id>/Cache.db`, an SQLite file (measured). A
  request header does not stop it, so `plugins/with-no-http-cache.js` gives the app a zero-capacity cache at launch.

## Signing in on the simulator

Nothing to set up. On the simulator `127.0.0.1` is the Mac, so the app's listener binds the Mac's loopback for the
length of a sign-in, and `lsof -nP -iTCP -sTCP:LISTEN` shows it there.

## Tests

Every collaborator is injected through `createChatGPTAuth`: an in-memory Keychain, a routed fake fetch, a fake
authorize, and a clock. `authorize.test.ts` runs the real `AuthRequest` over node's crypto against a fake listener, to
check the authorize URL OpenAI receives, the private sheet's handling and the listener's lifetime.
`openai-cookies.test.ts` runs the cookie clearing over a fake cookie store holding other sites' cookies too. `loopback-callback.test.ts`
drives the boundary over a fake native module. `scripts/probe-loopback-listener.sh` exercises the Swift listener itself.
