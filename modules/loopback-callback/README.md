# `modules/loopback-callback`

A local Expo module for iOS, in Swift on Network.framework. During one Sign in with ChatGPT it runs an HTTP
listener on the phone's own `127.0.0.1`, takes the single OAuth callback for that sign-in, and closes.

## Who may depend on it

Only `src/modules/chatgpt-auth/loopback-callback.ts`, the typed boundary the sign-in uses. `index.ts` declares the
native surface and is `null` where the module is not built in (Jest, Expo Go). Nothing else imports it.

## External constraints

- **OpenAI accepts only a loopback redirect** for the open-source flow: `http://127.0.0.1:<port>/auth/callback`.
  Only the port may vary, never `localhost`, and the same URI goes in the authorize request and the code exchange
  ([sign-in, §2 `redirect_uri`](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)). On an iPhone
  `127.0.0.1` is the phone itself, so the app must answer its own callback.
- **iOS may reclaim a suspended app's listening socket** (Apple TN2277). A user who leaves the sign-in sheet for
  another app, to read a login code in Mail for one, would come back to a dead listener, so returning to the
  foreground mid-sign-in rebinds the same port. A listener that fails after it was reported is rebound up to three
  times in a row.
- **The auth sheet does not see an `http` redirect**, so it stays open on the page this module serves; the caller
  dismisses it once the callback has arrived.

## Behaviour

| Case | Answer | The sign-in |
| --- | --- | --- |
| `GET /auth/callback`, `Host: 127.0.0.1:<port>`, the expected `state` | 200, "Return to Just Calorie to finish. You can close this page." The same for an `error=` callback, since the listener cannot know how the sign-in ends | resolves with every query parameter, form-decoded, `error=` included; the listener and every other connection close |
| another path | 404 | keeps waiting |
| a method other than `GET` | 405 | keeps waiting |
| no `state`, another `state`, a repeated parameter, a malformed query, or another `Host` | 400 | keeps waiting |
| a request head over 8 KB | 431 | keeps waiting |

- Binds TCP on IPv4 `127.0.0.1` only (a required local endpoint and the loopback interface), and refuses a peer that
  is not loopback. It does not set Network.framework's `acceptLocalOnly`. On the iOS simulator that setting made the
  framework ignore a real `127.0.0.1` peer as "non-local" and reset it, which the macOS probe cannot show (measured
  2026-10-05, f-e41a92). It tries port 1455, OpenAI's example, and binds a port the system picks when
  that one is taken; the caller builds the redirect URI from the port it reports.
- No response echoes anything from the request. Every answer is `no-store` and closes its connection.
- `state` is compared in constant time.
- Limits: 8 open connections; at that cap the oldest connection that has not sent a whole request head makes room
  for a newcomer, so local connections held idle cannot deny the browser's callback (qa f-6d2a95). A connection gets
  2 s to send its first byte and 10 s for its whole request head. The caller sets a timeout per sign-in (at most 15
  minutes; the sign-in uses 5).
- One listener at a time: a new `start` supersedes the previous one. `stop`, the timeout and superseding each end
  the wait.
- Nothing is logged: a request line carries the authorization code.
- Every Network.framework callback and every entry point runs on one serial queue, and each JS promise settles once.

`start`, `waitForCallback` and `stop` reject with one of these `code`s:

| `code` | When |
| --- | --- |
| `ERR_LOOPBACK_INVALID_OPTIONS` | an empty or over-long state, a port outside 1–65535, or a timeout outside 1 ms–15 min |
| `ERR_LOOPBACK_START_FAILED` | no port could be bound |
| `ERR_LOOPBACK_TIMEOUT` | no callback arrived in time |
| `ERR_LOOPBACK_CANCELLED` | `stop` was called, or the module was torn down |
| `ERR_LOOPBACK_SUPERSEDED` | a newer `start` replaced this listener |
| `ERR_LOOPBACK_FAILED` | the listener failed and could not be rebound |
| `ERR_LOOPBACK_NO_SESSION`, `ERR_LOOPBACK_ALREADY_WAITING` | an unknown session id, or a second waiter |

## Checking it without a device

`scripts/probe-loopback-listener.sh` compiles the three Swift files that do not import ExpoModulesCore together with
`probe/main.swift` into a macOS binary, then probes it over HTTP: what it binds (`lsof`), that `::1` and the Mac's
LAN address are refused, every row of the table above, a reopen, the fallback port and the timeout. It prints every
check and fails on any. `probe/` is outside `ios/`, so the app never compiles it.
