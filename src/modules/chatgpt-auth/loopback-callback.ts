import type { LoopbackCallbackNativeModule } from '../../../modules/loopback-callback';
import { ChatGPTAuthError } from './chatgpt-auth-error';

/** OpenAI's documented example port. When it is taken the listener binds any free port, which OpenAI allows. */
export const LOOPBACK_PREFERRED_PORT = 1455;

/** How long one sign-in may take before its listener gives up and closes. */
export const LOOPBACK_TIMEOUT_MS = 5 * 60 * 1000;

const MAX_PORT = 65_535;

export type LoopbackCallbackParams = Readonly<Record<string, string>>;

/** How a listener ended. A callback carrying `error=` with this attempt's state is still a `callback`. */
export type LoopbackOutcome =
  | { readonly type: 'callback'; readonly params: LoopbackCallbackParams }
  | { readonly type: 'timeout' }
  | { readonly type: 'cancelled' }
  | { readonly type: 'failed' };

export interface LoopbackCallback {
  /** Send exactly this as `redirect_uri` to the authorize and token endpoints of this attempt. */
  readonly redirectUri: string;
  /** Settles once and never rejects. */
  readonly outcome: Promise<LoopbackOutcome>;
  /** Closes the listener; an outcome still pending settles as `cancelled`. */
  stop(): Promise<void>;
}

export interface LoopbackStartRequest {
  readonly state: string;
  readonly preferredPort?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

export type StartLoopbackCallback = (request: LoopbackStartRequest) => Promise<LoopbackCallback>;

/** OpenAI accepts only this shape: scheme, host and path are fixed, and only the port may vary. */
export const loopbackRedirectUri = (port: number): string => `http://127.0.0.1:${port}/auth/callback`;

const FAILED: LoopbackOutcome = { type: 'failed' };

// A listener replaced by a newer one ends like a stopped one: either way this attempt is over.
const NATIVE_OUTCOMES: Readonly<Record<string, LoopbackOutcome>> = {
  ERR_LOOPBACK_TIMEOUT: { type: 'timeout' },
  ERR_LOOPBACK_CANCELLED: { type: 'cancelled' },
  ERR_LOOPBACK_SUPERSEDED: { type: 'cancelled' },
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

function outcomeOfRejection(error: unknown): LoopbackOutcome {
  const code = isRecord(error) ? error.code : undefined;

  return (typeof code === 'string' ? NATIVE_OUTCOMES[code] : undefined) ?? FAILED;
}

/** The callback's query parameters, refused unless every value is a string and the state is this attempt's. */
function outcomeOfCallback(value: unknown, state: string): LoopbackOutcome {
  if (!isRecord(value)) return FAILED;

  const entries = Object.entries(value);

  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')) return FAILED;

  const params: LoopbackCallbackParams = Object.freeze(Object.fromEntries(entries));

  return params.state === state ? { type: 'callback', params } : FAILED;
}

// The native stop always resolves; a rejection means the module is gone, and its listener closes on its own timeout.
const stopQuietly = (listener: LoopbackCallbackNativeModule, sessionId: number): Promise<void> =>
  listener.stop(sessionId).catch(() => undefined);

/** One listener at a time: a new start stops the previous listener first. Throws `ChatGPTAuthError` when none starts. */
export function createLoopbackCallbacks(native: LoopbackCallbackNativeModule | null): StartLoopbackCallback {
  let generation = 0;
  let active: LoopbackCallback | null = null;

  function open(listener: LoopbackCallbackNativeModule, sessionId: number, port: number, state: string) {
    let stopping: Promise<void> | null = null;
    const handle: LoopbackCallback = {
      redirectUri: loopbackRedirectUri(port),
      outcome: listener.waitForCallback(sessionId).then((value) => outcomeOfCallback(value, state), outcomeOfRejection),
      stop: () => (stopping ??= stopQuietly(listener, sessionId)),
    };

    void handle.outcome.then(() => {
      if (active === handle) active = null;
    });

    return handle;
  }

  async function startInTurn(listener: LoopbackCallbackNativeModule, request: LoopbackStartRequest, mine: number) {
    // A newer start was asked for before this one's turn came: it owns the sign-in, so this one binds nothing.
    if (mine !== generation) throw new ChatGPTAuthError('failed');

    const previous = active;

    active = null;
    await previous?.stop();

    let started: unknown;

    try {
      started = await listener.start({
        state: request.state,
        preferredPort: request.preferredPort ?? LOOPBACK_PREFERRED_PORT,
        timeoutMs: request.timeoutMs ?? LOOPBACK_TIMEOUT_MS,
      });
    } catch (error) {
      throw new ChatGPTAuthError('failed', { cause: error });
    }

    const sessionId = isRecord(started) ? started.sessionId : undefined;
    const port = isRecord(started) ? started.port : undefined;

    // Nothing can be stopped without an id, so a native listener that reported none is left to its own timeout.
    if (!isWhole(sessionId, 1, Number.MAX_SAFE_INTEGER)) throw new ChatGPTAuthError('failed');

    if (!isWhole(port, 1, MAX_PORT)) {
      await stopQuietly(listener, sessionId);
      throw new ChatGPTAuthError('failed');
    }

    const handle = open(listener, sessionId, port, request.state);

    // A newer start was asked for while this one was binding: it owns the sign-in, so this listener closes unused.
    if (mine !== generation) {
      await handle.stop();
      throw new ChatGPTAuthError('failed');
    }

    active = handle;

    return handle;
  }

  // Starts run one after another, in the order they were asked for, so native binds them in generation order and a
  // newer listener is never superseded by an older start that bound later (qa f-289e4e).
  let turn: Promise<unknown> = Promise.resolve();

  return function startLoopbackCallback(request) {
    if (native === null) return Promise.reject(new ChatGPTAuthError('unavailable'));

    const mine = ++generation;
    const started = turn.then(() => startInTurn(native, request, mine));

    turn = started.catch(() => undefined);

    return started;
  };
}
