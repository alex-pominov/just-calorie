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

/** Per-call options. An aborted `signal` stops the request; the call then rejects with the abort, not an EstimateError. */
export interface EstimateOptions {
  signal?: AbortSignal | undefined;
}
