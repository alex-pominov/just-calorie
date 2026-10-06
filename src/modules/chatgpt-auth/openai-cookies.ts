import type { HttpCookieKey, HttpCookiesNativeModule } from '../../../modules/http-cookies';

/** The sites a sign-out clears cookies for: OpenAI's API and sign-in pages, and ChatGPT. Every subdomain counts. */
export const OPENAI_COOKIE_SITES = ['openai.com', 'chatgpt.com'] as const;

export type ClearCookies = () => Promise<void>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function readKey(value: unknown): HttpCookieKey | null {
  if (!isRecord(value)) return null;

  const { name, domain, path } = value;

  return typeof name === 'string' && typeof domain === 'string' && typeof path === 'string' ? { name, domain, path } : null;
}

/** Every key in the native listing. An entry it cannot read cannot be removed either, so it never stops the others. */
function readListing(listing: unknown): readonly HttpCookieKey[] {
  if (!Array.isArray(listing)) throw new Error('unreadable cookie listing');

  return listing.map(readKey).filter((key) => key !== null);
}

// A cookie's domain is a host, or a domain with a leading dot that also covers its subdomains, either maybe written
// with the root's trailing dot. It is OpenAI's when it is one of the sites or ends in '.<site>'; a bare suffix match
// would also take 'notopenai.com'.
function isOpenAICookie({ domain }: HttpCookieKey): boolean {
  const lowered = domain.toLowerCase();
  const unrooted = lowered.endsWith('.') ? lowered.slice(0, -1) : lowered;
  const host = unrooted.startsWith('.') ? unrooted.slice(1) : unrooted;

  return OPENAI_COOKIE_SITES.some((site) => host === site || host.endsWith(`.${site}`));
}

/** Removes the openai.com and chatgpt.com cookies from the app's shared cookie store, and no other site's. */
export function createClearOpenAICookies(native: HttpCookiesNativeModule | null): ClearCookies {
  return async function clearOpenAICookies() {
    if (native === null) return;

    const openAI = readListing(await native.list()).filter(isOpenAICookie);

    if (openAI.length > 0) await native.remove(openAI);
  };
}
