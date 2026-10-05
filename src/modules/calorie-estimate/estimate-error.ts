import type { EstimateErrorKind } from './calorie-estimate.types';

// Fixed text only. Nothing from the request, the response body or the credential ever reaches a message:
// OpenAI's own 401 body quotes the key it was sent.
const MESSAGES: Record<EstimateErrorKind, string> = {
  'missing-auth': 'No account is signed in for calorie estimates',
  network: 'The calorie estimate request did not get a response',
  api: 'The calorie estimate service returned an error',
  'usage-limit': 'The ChatGPT plan has reached its usage limit',
  'plan-unavailable': 'The ChatGPT plan cannot be used for calorie estimates',
  'invalid-response': 'The calorie estimate response could not be read',
};

type EstimateErrorOptions = {
  readonly status?: number;
  readonly cause?: unknown;
};

/** The one failure `estimateCalories` throws. The UI switches on `kind`; `status` is set for 'api' only. */
export class EstimateError extends Error {
  override readonly name = 'EstimateError';
  readonly kind: EstimateErrorKind;
  readonly status: number | null;

  constructor(kind: EstimateErrorKind, options: EstimateErrorOptions = {}) {
    const status = options.status ?? null;

    super(status === null ? MESSAGES[kind] : `${MESSAGES[kind]} (status ${status})`, { cause: options.cause });
    this.kind = kind;
    this.status = status;
  }
}
