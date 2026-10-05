import type { CalorieEstimate, CalorieEstimateRequest, EstimateCredential, EstimateErrorKind, EstimateOptions } from './calorie-estimate.types';
import { EstimateError } from './estimate-error';
import { chooseEstimateModel, MODELS_PATH } from './openai-models';
import { buildEstimateRequestBody, ESTIMATE_MODEL, hasEstimateInput, RESPONSES_PATH } from './openai-request';
import { parseEstimateStream } from './openai-stream';

/** A photo upload on a slow mobile network is the long case; past this the request counts as 'network'. */
export const ESTIMATE_TIMEOUT_MS = 45_000;

// The part of a fetch Response the estimator reads, so a test can hand over a plain object.
type HttpResponse = { readonly ok: boolean; readonly status: number; json(): Promise<unknown>; text(): Promise<string> };
type FetchLike = (url: string, init: RequestInit) => Promise<HttpResponse>;
type Send = (url: string, init: RequestInit) => Promise<HttpResponse>;
type Read = <R>(body: Promise<R>, kind: 'network' | 'invalid-response') => Promise<R>;

export type EstimatorDependencies = {
  readonly getCredential: () => Promise<EstimateCredential | null>;
  /** OpenAI refused this ChatGPT token: drop it so the next `getCredential` refreshes. */
  readonly onCredentialRejected: (credential: EstimateCredential) => void;
  readonly getBaseUrl: () => string;
  readonly fetch: FetchLike;
  readonly timeoutMs?: number;
};

// The error body is never read: OpenAI's 401 quotes the key it was sent. On the ChatGPT plan route a 429 is the plan's
// usage limit and a 403 a plan, workspace or region that may not be used here, which retrying cannot change
// (developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery). On the key route both are ordinary.
const PLAN_ROUTE_KINDS: Partial<Record<number, EstimateErrorKind>> = { 403: 'plan-unavailable', 429: 'usage-limit' };

const httpError = (status: number, route: EstimateCredential['kind']) =>
  new EstimateError((route === 'chatgpt-plan' ? PLAN_ROUTE_KINDS[status] : undefined) ?? 'api', { status });

// One timeout covers the whole exchange, the model lookup and the streamed body included, and a timeout always reads
// as 'network'. A caller's own abort is rethrown as it is, so the caller can tell "I stopped it" from a failure.
async function withDeadline<T>(
  dependencies: EstimatorDependencies,
  callerSignal: AbortSignal | undefined,
  run: (send: Send, read: Read) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? ESTIMATE_TIMEOUT_MS);
  const callerAbort = () => controller.abort();
  const failure = (kind: 'network' | 'invalid-response', error: unknown) => {
    if (callerSignal?.aborted === true) return error;

    return new EstimateError(controller.signal.aborted ? 'network' : kind, { cause: error });
  };
  const read: Read = (body, kind) =>
    body.catch((error: unknown) => {
      throw failure(kind, error);
    });
  // A rejected fetch carries no response, so nothing in its cause can echo the credential back.
  const send: Send = (url, init) => read(dependencies.fetch(url, { ...init, signal: controller.signal }), 'network');

  if (callerSignal?.aborted === true) controller.abort();
  callerSignal?.addEventListener('abort', callerAbort);

  try {
    return await run(send, read);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', callerAbort);
  }
}

/** Builds `estimateCalories` over an injected credential, base URL and fetch, so tests never reach the network. */
export function createEstimateCalories(dependencies: EstimatorDependencies) {
  // A ChatGPT account's catalog changes rarely; it is asked again when the token rotates, about hourly.
  let planModel: { readonly token: string; readonly model: string } | null = null;

  async function modelFor(credential: EstimateCredential, baseUrl: string, send: Send, read: Read): Promise<string> {
    if (credential.kind === 'api-key') return ESTIMATE_MODEL;
    if (planModel?.token === credential.token) return planModel.model;

    const catalog = await send(`${baseUrl}${MODELS_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${credential.token}` },
    });

    if (!catalog.ok) throw httpError(catalog.status, credential.kind);

    const model = chooseEstimateModel(await read(catalog.json(), 'invalid-response'));
    planModel = { token: credential.token, model };

    return model;
  }

  async function requireCredential(): Promise<EstimateCredential> {
    const credential = await dependencies.getCredential();

    if (credential === null) throw new EstimateError('missing-auth');

    return credential;
  }

  function estimateWith(credential: EstimateCredential, request: CalorieEstimateRequest, signal: AbortSignal | undefined) {
    const baseUrl = dependencies.getBaseUrl();

    return withDeadline(dependencies, signal, async (send, read) => {
      const model = await modelFor(credential, baseUrl, send, read);
      const response = await send(`${baseUrl}${RESPONSES_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${credential.token}` },
        body: JSON.stringify(buildEstimateRequestBody(request, { model, route: credential.kind })),
      });

      if (!response.ok) throw httpError(response.status, credential.kind);

      return parseEstimateStream(await read(response.text(), 'network'));
    });
  }

  // A caller that stopped the request while its credential was fetched gets its abort back, never an EstimateError.
  async function credentialFor(signal: AbortSignal | undefined): Promise<EstimateCredential> {
    try {
      return await requireCredential();
    } catch (error) {
      if (signal?.aborted === true) throw signal.reason ?? new Error('Aborted');
      throw error;
    }
  }

  return async function estimateCalories(request: CalorieEstimateRequest, options: EstimateOptions = {}): Promise<CalorieEstimate> {
    if (!hasEstimateInput(request)) throw new Error('estimateCalories needs text or a photo');

    const credential = await credentialFor(options.signal);

    try {
      return await estimateWith(credential, request, options.signal);
    } catch (error) {
      const refused = error instanceof EstimateError && error.status === 401 && credential.kind === 'chatgpt-plan';

      if (!refused) throw error;

      // OpenAI refused the user's token though it had not expired: refresh it and try once more. A session that
      // cannot be refreshed has ended, which the next credential reports as 'missing-auth'.
      dependencies.onCredentialRejected(credential);

      return estimateWith(await credentialFor(options.signal), request, options.signal);
    }
  };
}
