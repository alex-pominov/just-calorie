# `modules/calorie-estimate`

Asks for a calorie estimate of what the user ate, from text, a photo, or both. **This is the one place
the vendor call lives.** No other file in `src/` or `app/` names the OpenAI URL, the model or a credential.
It imports no feature; it takes the signed-in user's token from `@/modules/chatgpt-auth`.

## Public API (`index.ts`)

- `estimateCalories(request, options?)` resolves to `{ reply, kcal }`.
  - `request` is `{ text?, photo? }`, where `photo` is `{ base64, mimeType }`. At least one is required;
    a request with neither throws a plain `Error`, because the caller should never send one.
  - `reply` is a sentence for the chat. `kcal` is a whole number of at least 1, or `null` when nothing
    countable was recognised.
  - `options.signal` lets the caller stop a request it no longer wants. The call then rejects with that
    abort itself, never an `EstimateError`, so the caller can tell "I stopped it" from a failure. The
    screen uses it to stop a reply nobody will read once it closes.
- `EstimateError` is the only error it throws for a failure the user can meet. Switch on `kind`:

  | `kind` | When |
  | --- | --- |
  | `missing-auth` | nobody is signed in with ChatGPT and the build has no development key; `fetch` is never called |
  | `network` | no response arrived: offline, DNS, a stream cut short, a refresh that could not reach OpenAI, or the `ESTIMATE_TIMEOUT_MS` timeout |
  | `api` | the service answered with a non-2xx status, kept in `status`, or the stream reported a failure |
  | `usage-limit` | the user's ChatGPT plan, or this app's share of it, is used up (HTTP 429 or `subscription_sharing_usage_limit_exceeded` on the plan route) |
  | `plan-unavailable` | the plan route refused with HTTP 403: a plan, workspace or region that may not be used (a ChatGPT Free account, for one); retrying cannot help |
  | `invalid-response` | a 2xx whose body breaks the contract below |

  Messages are fixed text. Nothing from the request, the response body or the credential reaches one.
  An error body is never read, because OpenAI's own 401 quotes the key it was sent.
  A token OpenAI refuses again right after it was refreshed is `api` 401 and the user stays signed in: ending the
  session there would send an account that lacks the permission round a sign-in loop.

## Whose account pays

`estimate-credential.ts` picks the credential for each request, in this order:

1. **The signed-in user's ChatGPT access token** (`getChatGPTAccessToken`, refreshed when near expiry). The request
   runs on that user's ChatGPT plan.
2. **`OPENAI_API_KEY`, in development builds only**, when nobody is signed in. It bills the key's owner, so it is
   unreachable in production twice over: `app.config.js` leaves it out of a production build's config
   (`src/config/app-config.test.ts`), and `getEstimateConfig` ignores it outside a development bundle (`__DEV__`).
3. Otherwise `missing-auth`, before any request: a production install nobody has signed in to cannot call OpenAI.

A refresh that fails, on the network or otherwise, is `network`: the user is still signed in, so the line must not
ask them to sign in again, and it never falls back to the key. A caller that aborts while the credential is fetched
gets its abort back. If OpenAI refuses the user's token with a 401 on the plan route, the token is handed back
(`rejectChatGPTAccessToken`), refreshed, and the estimate is tried once more; a session that cannot be refreshed has
ended, and the retry reads `missing-auth`.

- `.env` holds `OPENAI_API_KEY`. Expo CLI loads `.env` before it evaluates `app.config.js`, which copies it to
  `extra.calorieEstimate.apiKey` only for the dev server: `bun start` sets `JUST_CALORIE_DEV_SERVER=1`, and `NODE_ENV`
  must be `development`. A bare `expo start` therefore carries no key.
- `CALORIE_ESTIMATE_BASE_URL` overrides the base URL, which defaults to `https://api.openai.com/v1`, in development
  only: every request carries a user token, so a production build always talks to OpenAI. To show the no-network
  state, start Metro with it pointing somewhere unreachable: `CALORIE_ESTIMATE_BASE_URL=http://127.0.0.1:9 bun start`.
- A changed value needs Metro restarted, because the CLI reads the environment once at start.

The development key still reaches more places than the bundle, each found in review: Metro serves it in every dev
manifest, so Metro listens on localhost only (`bun start` runs `expo start --localhost`, and `bun ios` runs
`expo run:ios --no-bundler`, because `run:ios` has no host flag). `eas update` builds its manifest with `expo config`,
which skips `.env` and sets `NODE_ENV` to `development`; that is why the key also needs the dev-server marker, without
which a key in the shell or the EAS environment would be published. Its bundle (`expo export`) does load `.env`
unless `--environment` is passed, but no app code reads `process.env` or an `EXPO_PUBLIC_` value, so nothing in `.env`
reaches a bundle today; an `EXPO_PUBLIC_` value added later would (qa f-9b92c2). No build and no update carries the
key.

## The request

Both routes send the ChatGPT plan route's contract, so the development key exercises the same request
([preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)):
the system prompt goes in `instructions` (the plan route rejects a system message), the user turn alone in `input`,
`stream: true` and `store: false`.

- **The model.** On the development key it is `ESTIMATE_MODEL` (`openai-request.ts`), `gpt-6-luna`, the cheapest
  current vision model with structured outputs in OpenAI's catalog on 2026-10-04. On the plan route OpenAI accepts only
  a model the account lists, so the module asks `GET /models` with the user's token first, takes `ESTIMATE_MODEL` if it
  is listed (`visibility: "list"`), and otherwise the first listed model, in the server's order
  ([models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)). The
  choice is kept until the token rotates, about hourly.
- Reasoning effort is `low`. `max_output_tokens` is sent on the key route only, as a cost cap; the plan route refuses it.
- The Responses API is asked for strict JSON Schema output, `{ reply: string, kcal: integer ≥ 1 | null }`.
  A photo goes as a `data:` URL with `detail: 'low'`.
- The reply language follows the owner's ruling (a) of 2026-10-04 (request [0]): the reply is in the
  language the user wrote in, and the app's own copy stays in English. The ruling does not cover a photo
  sent alone, with no text to take a language from. For that case, replying in English is this module's
  own default, and changing it does not need the owner. The single `REPLY_LANGUAGE_RULE` line holds both.
- The stream is read whole (`response.text()`) and then parsed one event at a time (`openai-stream.ts`), stopping at
  the first terminal event: success is a `response.completed` event and nothing else. `response.failed` and `error` events are `usage-limit` or `api` by
  their code, `response.incomplete` is `invalid-response`, and a stream that ends with no terminal event is `network`.

## What counts as a valid reply

The response must be `completed`, with a message whose content is `output_text` holding the JSON above.

- **A `kcal` that is 0, negative, fractional or not a number refuses the whole response** as
  `invalid-response`. It is not repaired to `null` or rounded. The schema already demanded a whole
  number of at least 1, or `null` for "nothing countable". A value outside that means the contract
  broke, and guessing what the model meant could add a number nobody estimated to today's total.
- A blank `reply`, a missing field, text that is not JSON, or an `incomplete` status (for example the
  output-token cap was hit) is `invalid-response` too.
- A `refusal` is shown as a sentence: it becomes `{ reply: <the refusal>, kcal: null }`.

## Adding a provider

Callers depend only on `estimateCalories`, the `{ reply, kcal }` result and the error kinds, so a second provider
(Claude is the owner's planned follow-up) changes nothing outside this module. It adds its credential kind to
`EstimateCredential` and `estimate-credential.ts`, and its own request and response files beside the OpenAI ones,
keeping the result shape and the five kinds.

## Tests

The tests inject the credential, the base URL and `fetch` through `createEstimateCalories`, so jest never reaches
the network. A recognisable fake key and a fake user token check that no error message, string form or cause carries
either.
