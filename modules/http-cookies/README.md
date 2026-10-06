# `modules/http-cookies`

A local Expo module for iOS, in Swift. It lists the cookies in the app's shared cookie store,
`HTTPCookieStorage.shared`, by name, domain and path, and removes the cookies it is given by those three keys.

## Who may depend on it

Only `src/modules/chatgpt-auth`: `chatgpt-session.ts` hands the native module to `openai-cookies.ts`, which decides
which cookies go. `index.ts` declares the native surface and is `null` where the module is not built in (Jest, Expo
Go). Nothing else imports it, by convention; no lint rule enforces that.

## External constraints

- **The store is the one React Native's fetch and `expo/fetch` both use**, persisted in
  `Library/Cookies/Cookies.binarycookies`. The private auth sheet keeps no cookies, and ChatGPT's settings open in
  the default browser, so neither leaves anything here or anywhere else in the app.
- **Why not a package** (measured 2026-10-05, backlog 17): `@preeternal/react-native-cookie-manager` 7.0.0, the
  maintained successor of the deprecated `@react-native-cookies/cookies`, removes only by name through a URL, so it
  would move every cookie with its value into JS and clear them one at a time, and it ships WebKit and Android code
  this iOS-only app does not use. React Native's `Networking.clearCookies` removes every site's cookies.

## Behaviour

- `list()` resolves every cookie in the store as `{ name, domain, path }`. A domain keeps its leading dot when the
  cookie covers subdomains. No value, expiry or flag is returned.
- `remove(keys)` deletes each cookie whose name, domain and path all equal one of `keys`, and resolves once the store
  no longer returns them. The system, not the app, writes the file a moment later. Matching is exact, so keys come
  from `list()`: `openai.com` does not name a cookie stored as `.openai.com`. A key that matches nothing is ignored.
- Nothing is logged.
