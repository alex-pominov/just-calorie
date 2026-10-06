import { requireOptionalNativeModule } from 'expo';

/** Names one cookie in the store: two cookies may share a name on different domains or paths. */
export interface HttpCookieKey {
  readonly name: string;
  readonly domain: string;
  readonly path: string;
}

/** The native module in `ios/`. A listing is parsed by the caller; it carries keys only, never a cookie's value. */
export interface HttpCookiesNativeModule {
  list(): Promise<unknown>;
  remove(cookies: readonly HttpCookieKey[]): Promise<void>;
}

/** Null in a build without the module, such as Expo Go or Jest. */
export const httpCookiesNative = requireOptionalNativeModule<HttpCookiesNativeModule>('HttpCookies');
