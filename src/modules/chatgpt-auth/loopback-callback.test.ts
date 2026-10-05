import type { LoopbackCallbackNativeModule, LoopbackStartOptions } from '../../../modules/loopback-callback';
import { ChatGPTAuthError } from './chatgpt-auth-error';
import { createLoopbackCallbacks, LOOPBACK_PREFERRED_PORT, LOOPBACK_TIMEOUT_MS } from './loopback-callback';

const STATE = 'state-1';

interface Waiter {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

const nativeError = (code: string) => Object.assign(new Error('native'), { code });

const flushPromises = async () => {
  for (let step = 0; step < 20; step += 1) await Promise.resolve();
};

/**
 * Stands in for ios/LoopbackCallbackServer.swift: one session at a time, settled by `deliver`, `fail` or `stop`. As there,
 * a stale id's waiter is told it was superseded and a stale id's stop does nothing. `holdNextStart` keeps the next bind
 * pending until the test releases it.
 */
function fakeNative(port = LOOPBACK_PREFERRED_PORT) {
  const waiters = new Map<number, Waiter>();
  let lastId = 0;
  let held: (() => void) | null = null;
  const settle = (sessionId: number, settleWith: (waiter: Waiter) => void) => {
    const waiter = waiters.get(sessionId);

    waiters.delete(sessionId);
    if (waiter) settleWith(waiter);
  };
  const bind = () => {
    settle(lastId, (waiter) => waiter.reject(nativeError('ERR_LOOPBACK_SUPERSEDED')));
    lastId += 1;

    return { sessionId: lastId, port };
  };
  const native = {
    start: jest.fn(
      (_options: LoopbackStartOptions): Promise<unknown> =>
        held === null
          ? Promise.resolve(bind())
          : new Promise((resolve) => {
              held = () => {
                held = null;
                resolve(bind());
              };
            }),
    ),
    waitForCallback: jest.fn((sessionId: number) =>
      sessionId === lastId
        ? new Promise<unknown>((resolve, reject) => waiters.set(sessionId, { resolve, reject }))
        : Promise.reject(nativeError('ERR_LOOPBACK_SUPERSEDED')),
    ),
    stop: jest.fn((sessionId: number) => {
      if (sessionId === lastId) settle(sessionId, (waiter) => waiter.reject(nativeError('ERR_LOOPBACK_CANCELLED')));

      return Promise.resolve();
    }),
  } satisfies LoopbackCallbackNativeModule;

  return {
    native,
    listening: () => [...waiters.keys()],
    deliver: (sessionId: number, params: Record<string, unknown>) => settle(sessionId, (waiter) => waiter.resolve(params)),
    fail: (sessionId: number, code: string) => settle(sessionId, (waiter) => waiter.reject(nativeError(code))),
    holdNextStart: () => {
      held = () => undefined;

      return () => held?.();
    },
  };
}

describe('createLoopbackCallbacks', () => {
  it('asks native for the documented port and the five-minute timeout', async () => {
    const { native } = fakeNative();

    await createLoopbackCallbacks(native)({ state: STATE });

    expect(native.start).toHaveBeenCalledWith({ state: STATE, preferredPort: 1455, timeoutMs: LOOPBACK_TIMEOUT_MS });
    expect(LOOPBACK_TIMEOUT_MS).toBe(300_000);
  });

  it('sends OpenAI the loopback redirect for the port native actually bound', async () => {
    const { native } = fakeNative(53_662);

    const listener = await createLoopbackCallbacks(native)({ state: STATE });

    expect(listener.redirectUri).toBe('http://127.0.0.1:53662/auth/callback');
  });

  it('hands over the callback carrying this attempt state', async () => {
    const fake = fakeNative();
    const listener = await createLoopbackCallbacks(fake.native)({ state: STATE });

    fake.deliver(1, { code: 'the-code', state: STATE, client_id: 'oaiapp_test', scope: 'openid email' });

    await expect(listener.outcome).resolves.toEqual({
      type: 'callback',
      params: { code: 'the-code', state: STATE, client_id: 'oaiapp_test', scope: 'openid email' },
    });
  });

  it('hands over a declined consent as a callback, for the caller to read its error', async () => {
    const fake = fakeNative();
    const listener = await createLoopbackCallbacks(fake.native)({ state: STATE });

    fake.deliver(1, { error: 'access_denied', state: STATE });

    await expect(listener.outcome).resolves.toEqual({ type: 'callback', params: { error: 'access_denied', state: STATE } });
  });

  it.each([
    ['another attempt state', { code: 'the-code', state: 'state-2' }],
    ['no state', { code: 'the-code' }],
    ['a value that is not a string', { code: 42, state: STATE }],
  ])('refuses a callback with %s', async (_case, params) => {
    const fake = fakeNative();
    const listener = await createLoopbackCallbacks(fake.native)({ state: STATE });

    fake.deliver(1, params);

    await expect(listener.outcome).resolves.toEqual({ type: 'failed' });
  });

  it('refuses a callback native hands over as something other than an object', async () => {
    const fake = fakeNative();
    fake.native.waitForCallback.mockResolvedValueOnce('code=the-code');

    const listener = await createLoopbackCallbacks(fake.native)({ state: STATE });

    await expect(listener.outcome).resolves.toEqual({ type: 'failed' });
  });

  it('a stopped listener stops natively and ends as cancelled', async () => {
    const fake = fakeNative();
    const listener = await createLoopbackCallbacks(fake.native)({ state: STATE });

    await listener.stop();

    expect(fake.native.stop).toHaveBeenCalledWith(1);
    await expect(listener.outcome).resolves.toEqual({ type: 'cancelled' });
    expect(fake.listening()).toEqual([]);
  });

  it('stopping twice asks native once', async () => {
    const fake = fakeNative();
    const listener = await createLoopbackCallbacks(fake.native)({ state: STATE });

    await Promise.all([listener.stop(), listener.stop()]);

    expect(fake.native.stop).toHaveBeenCalledTimes(1);
  });

  it('a timeout ends as its own outcome', async () => {
    const fake = fakeNative();
    const listener = await createLoopbackCallbacks(fake.native)({ state: STATE });

    fake.fail(1, 'ERR_LOOPBACK_TIMEOUT');

    await expect(listener.outcome).resolves.toEqual({ type: 'timeout' });
  });

  it('a listener native replaced or lost ends as cancelled or failed, never as a rejection', async () => {
    const fake = fakeNative();
    const start = createLoopbackCallbacks(fake.native);
    const replaced = await start({ state: STATE });

    fake.fail(1, 'ERR_LOOPBACK_SUPERSEDED');
    const lost = await start({ state: 'state-2' });
    fake.fail(2, 'ERR_LOOPBACK_FAILED');

    await expect(replaced.outcome).resolves.toEqual({ type: 'cancelled' });
    await expect(lost.outcome).resolves.toEqual({ type: 'failed' });
  });

  it('starting a second sign-in stops the first listener before the second binds', async () => {
    const fake = fakeNative();
    const start = createLoopbackCallbacks(fake.native);
    const first = await start({ state: STATE });

    const second = await start({ state: 'state-2' });

    expect(fake.native.stop).toHaveBeenCalledWith(1);
    expect(fake.native.stop.mock.invocationCallOrder[0]).toBeLessThan(fake.native.start.mock.invocationCallOrder[1] ?? 0);
    await expect(first.outcome).resolves.toEqual({ type: 'cancelled' });
    expect(fake.listening()).toEqual([2]);
    expect(second.redirectUri).toBe('http://127.0.0.1:1455/auth/callback');
  });

  it('once the callback has arrived nothing is left to stop when the next sign-in starts', async () => {
    const fake = fakeNative();
    const start = createLoopbackCallbacks(fake.native);
    const first = await start({ state: STATE });
    fake.deliver(1, { code: 'the-code', state: STATE });
    await first.outcome;

    await start({ state: 'state-2' });

    expect(fake.native.stop).not.toHaveBeenCalled();
  });

  it('a start still binding when a newer one is asked for is stopped once bound and fails, and only the newer one listens', async () => {
    const fake = fakeNative();
    const start = createLoopbackCallbacks(fake.native);
    const releaseOlder = fake.holdNextStart();

    const older = start({ state: STATE });
    await flushPromises();
    const newer = start({ state: 'state-2' });
    releaseOlder();

    await expect(older).rejects.toMatchObject({ kind: 'failed' });
    await expect(newer).resolves.toMatchObject({ redirectUri: 'http://127.0.0.1:1455/auth/callback' });
    expect(fake.native.stop).toHaveBeenCalledWith(1);
    expect(fake.listening()).toEqual([2]);
  });

  it('leaves the newest of two quick starts listening while an older listener is open (qa f-289e4e)', async () => {
    const fake = fakeNative();
    const start = createLoopbackCallbacks(fake.native);
    await start({ state: 's0' });

    const older = start({ state: 'x' });
    const newer = start({ state: 'y' });
    const [olderResult, newerResult] = await Promise.allSettled([older, newer]);

    expect(olderResult).toMatchObject({ status: 'rejected', reason: { kind: 'failed' } });
    expect(newerResult.status).toBe('fulfilled');
    expect(fake.native.start.mock.calls.map(([options]) => options.state)).toEqual(['s0', 'y']);
    expect(fake.listening()).toEqual([2]);
  });

  it('a build without the native module reports sign-in unavailable', async () => {
    const start = createLoopbackCallbacks(null);

    await expect(start({ state: STATE })).rejects.toEqual(new ChatGPTAuthError('unavailable'));
  });

  it('a listener native could not start fails the sign-in', async () => {
    const fake = fakeNative();
    fake.native.start.mockRejectedValueOnce(nativeError('ERR_LOOPBACK_START_FAILED'));

    await expect(createLoopbackCallbacks(fake.native)({ state: STATE })).rejects.toMatchObject({ kind: 'failed' });
  });

  // With no usable id nothing can be stopped, so that native listener is left to its own timeout.
  it.each([0, -1, 1.5, '1', undefined])('a reported session id of %p fails the sign-in and waits for nothing', async (sessionId) => {
    const fake = fakeNative();
    fake.native.start.mockResolvedValueOnce({ sessionId, port: LOOPBACK_PREFERRED_PORT });

    await expect(createLoopbackCallbacks(fake.native)({ state: STATE })).rejects.toMatchObject({ kind: 'failed' });
    expect(fake.native.waitForCallback).not.toHaveBeenCalled();
  });

  it.each([0, 65_536, 1455.5, '1455'])('a reported port of %p is refused and its listener stopped', async (port) => {
    const fake = fakeNative();
    fake.native.start.mockResolvedValueOnce({ sessionId: 3, port });

    await expect(createLoopbackCallbacks(fake.native)({ state: STATE })).rejects.toMatchObject({ kind: 'failed' });
    expect(fake.native.stop).toHaveBeenCalledWith(3);
    expect(fake.native.waitForCallback).not.toHaveBeenCalled();
  });
});
