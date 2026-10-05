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
  | `missing-auth` | nobody is signed in with ChatGPT; `fetch` is never called |
  | `network` | no response arrived: offline, DNS, a stream cut short, a refresh that could not reach OpenAI, or the `ESTIMATE_TIMEOUT_MS` timeout |
  | `api` | the service answered with a non-2xx status, kept in `status`, or the stream reported a failure |
  | `usage-limit` | the user's ChatGPT plan, or this app's share of it, is used up (HTTP 429 or `subscription_sharing_usage_limit_exceeded` on the plan route) |
  | `plan-unavailable` | the plan route refused with HTTP 403: a plan, workspace or region that may not be used (a ChatGPT Free account, for one); retrying cannot help |
  | `invalid-response` | a 2xx whose body breaks the contract below |

  Messages are fixed text. Nothing from the request, the response body or the credential reaches one.
  An error body is never read, because OpenAI's own 401 quotes the token it was sent.
  A token OpenAI refuses again right after it was refreshed is `api` 401 and the user stays signed in: ending the
  session there would send an account that lacks the permission round a sign-in loop.

## Whose account pays

Every estimate runs on the signed-in user's ChatGPT plan. `estimate-credential.ts` takes that user's ChatGPT access
token (`getChatGPTAccessToken`, refreshed when near expiry); with nobody signed in the call is `missing-auth` before any
request, in every build. There is no API key, no base-URL override and no build setting to supply one:
`app.config.js` carries none, in any environment (`src/config/app-config.test.ts`).

A refresh that fails, on the network or otherwise, is `network`: the user is still signed in, so the line must not
ask them to sign in again. A caller that aborts while the credential is fetched gets its abort back. If OpenAI refuses
the user's token with a 401, the token is handed back (`rejectChatGPTAccessToken`), refreshed, and the estimate is
tried once more; a session that cannot be refreshed has ended, and the retry reads `missing-auth`.

## The request

Every request follows the ChatGPT plan route's contract
([preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)):
the system prompt goes in `instructions` (the plan route rejects a system message), the user turn alone in `input`,
`stream: true` and `store: false`.

- **The model.** OpenAI accepts only a model the account lists, so the module asks `GET /models` with the user's
  token first. It takes `ESTIMATE_MODEL` (`openai-request.ts`), `gpt-6-luna`, the cheapest current vision model with
  structured outputs in OpenAI's catalog on 2026-10-04, if it is listed (`visibility: "list"`), and otherwise the first
  listed model, in the server's order
  ([models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)). The
  choice is kept until the token rotates, about hourly.
- Reasoning effort is `low`. `max_output_tokens` is never sent: the plan route refuses it.
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
  output was cut short) is `invalid-response` too.
- A `refusal` is shown as a sentence: it becomes `{ reply: <the refusal>, kcal: null }`.

## Adding a provider

Callers depend only on `estimateCalories`, the `{ reply, kcal }` result and the error kinds, so a second provider
(Claude is the owner's planned follow-up) changes nothing outside this module. It adds its credential beside the
ChatGPT token in `estimate-credential.ts`, and its own request and response files beside the OpenAI ones, keeping the
result shape and the error kinds.

## Tests

The tests inject the credential and `fetch` through `createEstimateCalories`, so jest never reaches the network. A
recognisable fake user token checks that no error message, string form or cause carries it.
