/** A photo as the picker hands it over: the encoded bytes and their image MIME type. */
export type EstimatePhoto = {
  readonly base64: string;
  readonly mimeType: string;
};

/** What the user sent. At least one of the two is required. */
export type CalorieEstimateRequest =
  | { readonly text: string; readonly photo?: EstimatePhoto }
  | { readonly text?: string; readonly photo: EstimatePhoto };

/**
 * The answer to one request. `reply` is a sentence for the chat; `kcal` is a whole number of at least 1,
 * or null when nothing countable was recognised.
 */
export type CalorieEstimate = {
  readonly reply: string;
  readonly kcal: number | null;
};

export type EstimateErrorKind = 'missing-auth' | 'network' | 'api' | 'usage-limit' | 'plan-unavailable' | 'invalid-response';

/** Where the estimate request goes. `devApiKey` is null in every production build and when no key is set. */
export type EstimateConfig = {
  readonly devApiKey: string | null;
  readonly baseUrl: string;
};

/** Whose account pays for an estimate: the signed-in user's ChatGPT plan, or a development build's API key. */
export interface EstimateCredential {
  readonly kind: 'chatgpt-plan' | 'api-key';
  readonly token: string;
}

/** Per-call options. An aborted `signal` stops the request; the call then rejects with the abort, not an EstimateError. */
export interface EstimateOptions {
  signal?: AbortSignal | undefined;
}
