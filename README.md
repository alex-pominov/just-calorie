# Just Calorie

A calorie tracker built around one number: your daily cap. Each day is a bowl that fills as you log what you eat,
and the calendar shows how every past day went. **Track with AI** estimates a meal's calories from a short
description, a photo, or both, using **your own ChatGPT plan** through Sign in with ChatGPT. There is no server
and no API key: the app talks to OpenAI directly from your phone, on your account.

Just Calorie is an [Expo](https://expo.dev) (SDK 57) React Native app for **iOS only**. There is no Android or web
target. It uses [Bun](https://bun.sh).

## Build and run

You need macOS with Xcode (for the iOS simulator and device builds) and Bun.

```sh
bun install
bun ios      # build the development build and install it on a simulator
bun start    # start Metro for it, on 127.0.0.1 only
```

**No secrets are needed.** There is no `.env` to create, no API key and no OpenAI-issued client: each person who
signs in registers their own (see below).

| Command | Does |
| --- | --- |
| `bun install` | Installs dependencies. Add a runtime package with `bunx expo install <pkg>`, never `bun add`, so Expo picks an SDK-compatible version |
| `bun ios` | Builds the iOS development build and installs it on a simulator (`expo run:ios --no-bundler`); serve it with `bun start` |
| `bun start` | Starts Metro for an installed development build, on 127.0.0.1 only (`expo start --localhost`, IPv4 first). `bun start --port <n>` picks another port |
| `bun lint` | ESLint, including the import-boundary rules below |
| `bun typecheck` | `tsc --noEmit` |
| `bun lint:cycles` | Fails on any import cycle under `src/` and `app/` |
| `bun run test` | Jest (jest-expo); writes `coverage/junit.xml`. Bare `bun test` is Bun's own test runner, not Jest |

Always start Metro with `bun start`, never a bare `expo start`, and never let `expo run:ios` start its own bundler:
Metro serves the app's whole source, and only a simulator on this Mac needs it, so it listens on 127.0.0.1 alone.
`bun start` resolves IPv4 first: Expo writes 127.0.0.1 into the manifest's URLs, and Node would otherwise bind
`localhost` to `::1` only, so the app could fetch its manifest but never its bundle.

### On an iPhone

A Release build carries its JavaScript inside the app, so it needs no Metro:

```sh
bunx expo run:ios --configuration Release --device <udid>
```

Sign it with your own Apple team (Xcode's automatic signing), and set your own `ios.bundleIdentifier` in `app.json`
if the current one is not available to your team. EAS (`eas.json`) is optional and needs your own Expo account and
project.

### The development build

`app.config.js` gives every non-production build expo-dev-client's launch options: no tools button, no onboarding,
no menu at launch, and a default launch URL of `http://localhost:8081`, so a cold launch or a cold deep link opens
the app on Metro without the launcher. On another port, open the server from the development build's launcher. These
options are written into `ios/` at prebuild, and `bun ios` prebuilds only when `ios/` is missing, so after changing
them run `bunx expo prebuild --platform ios`, then `bun ios`. A build with `NODE_ENV` or `EAS_BUILD_PROFILE` set to
`production` gets none of these options; only that exact lowercase value counts.

`ios/` is generated (Continuous Native Generation) and is not committed. Native configuration lives in `app.json`,
`app.config.js` and the config plugins under `plugins/`.

The development client waits a fixed 10 s for Metro's manifest. Past that, for instance on a heavily loaded machine,
a cold launch or deep link lands in the launcher and the link is lost: open it again rather than debugging it, and
before a cold check warm Metro with one request to `http://127.0.0.1:<port>/status`.

### Seeding the Calendar on a simulator

`scripts/seed-calendar-sim.sh` writes a month of past days at once, straight into the installed app's SQLite
database. It terminates the app, refuses any schema version but the one it was written for, and touches only
existing tables.

- `scripts/seed-calendar-sim.sh seed` replaces every day from the 1st of last month to yesterday. Every state is in
  the rows the Calendar opens on: last month's final week, then this month's past days.
- `scripts/seed-calendar-sim.sh set-day 2026-10-02 900` turns one past day into a single 900 kcal entry (`0` empties
  it).
- Both write rows directly and recompute no carry-over, so a carry-over chain they leave can disagree with the app's
  rule, and an edit in the app repairs a stale day only when it is to the day just before it: the app's recompute
  stops at the first carry-over it leaves unchanged. To check the chain, seed it in the app instead:
  `justcalorie://dev/seed?scenario=over-chain`.
- Set `SIM_UDID=<udid>` to pick the simulator (`xcrun simctl list devices`). Then reopen with
  `xcrun simctl openurl <udid> justcalorie://calendar`.

## Sign in with ChatGPT

Track with AI runs on the signed-in user's own ChatGPT plan, through OpenAI's
[ChatGPT plan usage for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source). Nobody's key
or account is built into the app. In plain words:

1. **Your first sign-in registers your own client.** The app opens OpenAI's sign-in with
   `client_id=dynamic_agent_client`, the app's name and a random ID for this install. You sign in and approve, and
   OpenAI returns an issued `oaiapp_…` client ID that is bound to your ChatGPT account. Later sign-ins reuse it.
2. **The callback comes back to the phone itself.** OpenAI accepts only `http://127.0.0.1:<port>/auth/callback` as the
   return address (not `localhost`, not an app link), so while you sign in the app runs a one-time HTTP listener on
   the phone's own `127.0.0.1`. It takes the single callback for that sign-in, checks it, shows a page saying you can
   close it, and stops.
3. **The app exchanges the code for tokens** with PKCE and no secret, and uses the plan only if you granted
   permission to use it.
4. **Your tokens and your client ID live only in the iOS Keychain**, on this device only and readable only while the
   phone is unlocked. They never leave it except to go to OpenAI.
5. **Signing out** revokes the session at OpenAI and deletes the tokens. The phone keeps your account's client ID, so
   signing in again does not register another one; a client ID on its own grants nothing. A different ChatGPT
   account on the same phone registers its own client.

Review what the app uses of your plan and set its limits at
[ChatGPT Settings → Usage](https://chatgpt.com/settings/usage); the app links there. You can disconnect the app in
ChatGPT Settings at any time. The details, with OpenAI's documentation for each step, are in
`src/modules/chatgpt-auth/README.md`.

## Structure

Routes live in `app/` at the repo root (Expo Router). Everything else lives in `src/`, and every folder under `src/`
is one of two kinds.

**Module-shaped** — a self-contained unit with an `index.ts` that is its public API. Code outside the folder imports
only from that index; code inside uses relative paths.

- `src/features/<name>/` — a business domain: its components, hooks, stores, types and pure utils.
- `src/modules/<name>/` — infrastructure and third-party wrappers. A module never imports a feature.
- `src/components/<category>/` — shared UI, grouped by purpose.

**Atom folders** — flat folders of single-file helpers, imported per file, with **no** `index.ts`.

- `src/hooks/`, `src/utils/`, `src/config/` — never import a feature.
- `src/providers/` — React provider composition only.

A route holds the screen's declarative composition; logic lives in the owning feature's `hooks/`.

### Enforced by lint

- No deep import across a boundary (`@/features/x/y`, `@/modules/x/y`, `@/components/x/y`, `@/assets/icons/x`), and
  no import of a folder's own public index from inside it.
- No relative path that lands in another feature, module or component category: cross with `@/`.
- Modules, shared components and atom folders never import a feature.
- `expo-sqlite` is importable only inside `src/modules/database/`, the database gateway — by `import`, `require()` or
  `import()`.
- `bun lint:cycles` fails on any require cycle.
- `no-second-source.test.ts` fails on a design value written outside `src/modules/theme/tokens.js`, and on any
  Tailwind scale that still reaches a stock value.

### Things that break silently

- `metro.config.js` pins NativeWind's `inlineRem` to 16. Removing it moves the whole Tailwind scale onto a 3.5px
  grid, off the design's 4px grid.
- Jest collects tests from `src/` only. A test under `app/` would be a route and is never run, so keep the tested
  code in `src/`.

## License

MIT — see [`LICENSE`](LICENSE). The Manrope fonts in `src/assets/fonts/` are under the SIL Open Font License
([`src/assets/fonts/OFL.txt`](src/assets/fonts/OFL.txt)).
