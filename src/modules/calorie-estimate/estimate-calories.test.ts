import { createEstimateCalories } from './estimate-calories';
import { createCredentialSource } from './estimate-credential';
import { EstimateError } from './estimate-error';

const USER_TOKEN = 'chatgpt-user-token-FAKE-0123456789-must-never-leak';
const PHOTO = { base64: 'AAECAwQF', mimeType: 'image/jpeg' };
const ESTIMATE = { reply: 'An apple, about 95 kcal.', kcal: 95 };

const completedStream = (estimate: unknown) =>
  [
    { type: 'response.created', response: { status: 'in_progress' } },
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          { type: 'reasoning', summary: [] },
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(estimate) }] },
        ],
      },
    },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

const respond = (status: number, body: { json?: unknown; text?: string } = {}) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body.json ?? {}),
    text: () => Promise.resolve(body.text ?? ''),
  });

const CATALOG = { models: [{ slug: 'gpt-6.1-sol', visibility: 'list' }] };

function routedFetch(responses: { stream?: () => ReturnType<typeof respond>; catalog?: () => ReturnType<typeof respond> } = {}) {
  return jest.fn((url: string) =>
    url.endsWith('/models')
      ? (responses.catalog ?? (() => respond(200, { json: CATALOG })))()
      : (responses.stream ?? (() => respond(200, { text: completedStream(ESTIMATE) })))(),
  );
}

function setup(options: { credential?: string | null; fetch?: jest.Mock; timeoutMs?: number } = {}) {
  const credential = { current: options.credential === undefined ? USER_TOKEN : options.credential };
  const fetch = options.fetch ?? routedFetch();
  const onCredentialRejected = jest.fn();
  const estimate = createEstimateCalories({
    getCredential: () => Promise.resolve(credential.current),
    onCredentialRejected,
    fetch,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });

  return { estimate, fetch, credential, onCredentialRejected };
}

const callsTo = (fetch: jest.Mock, suffix: string) => fetch.mock.calls.filter(([url]) => String(url).endsWith(suffix));

function sentBody(fetch: jest.Mock) {
  const init: unknown = callsTo(fetch, '/responses')[0]?.[1];
  const body = typeof init === 'object' && init !== null && 'body' in init ? init.body : undefined;

  return typeof body === 'string' ? JSON.parse(body) : undefined;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('expected a rejection');
}

// Every place a thrown value could carry text: its message, its string form, its cause chain.
function everyTextOf(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current !== undefined && current !== null) {
    parts.push(String(current), JSON.stringify(current) ?? '');
    if (current instanceof Error) parts.push(current.message, current.stack ?? '');
    current = current instanceof Error ? current.cause : undefined;
  }

  return parts.join('\n');
}

describe('estimateCalories', () => {
  it('streams a text request to the Responses API and returns the parsed estimate', async () => {
    const { estimate, fetch } = setup();

    await expect(estimate({ text: '  one apple  ' })).resolves.toEqual(ESTIMATE);

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://api.openai.com/v1/models', 'https://api.openai.com/v1/responses']);
    expect(callsTo(fetch, '/responses')[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${USER_TOKEN}` },
    });
    expect(sentBody(fetch)).toMatchObject({
      model: 'gpt-6.1-sol',
      store: false,
      stream: true,
      text: { format: { type: 'json_schema', strict: true, schema: { required: ['reply', 'kcal'] } } },
    });
  });

  it('sends its instructions as `instructions` and the user turn alone in `input`, as the ChatGPT plan route requires', async () => {
    const { estimate, fetch } = setup();

    await estimate({ text: 'one apple' });

    const body = sentBody(fetch);
    expect(typeof body.instructions).toBe('string');
    expect(body.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'one apple' }] }]);
  });

  it('sends a photo as a low-detail data URL', async () => {
    const { estimate, fetch } = setup();

    await estimate({ photo: PHOTO });

    expect(sentBody(fetch).input[0].content).toEqual([{ type: 'input_image', image_url: 'data:image/jpeg;base64,AAECAwQF', detail: 'low' }]);
  });

  it('sends text and a photo together as one user message', async () => {
    const { estimate, fetch } = setup();

    await estimate({ text: 'my lunch', photo: PHOTO });

    expect(sentBody(fetch).input[0].content).toEqual([
      { type: 'input_text', text: 'my lunch' },
      { type: 'input_image', image_url: 'data:image/jpeg;base64,AAECAwQF', detail: 'low' },
    ]);
  });

  it("refuses with 'missing-auth' and never calls fetch when there is no credential", async () => {
    const { estimate, fetch } = setup({ credential: null });

    await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ name: 'EstimateError', kind: 'missing-auth' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cannot call OpenAI at all when nobody is signed in, whatever the build', async () => {
    const fetch = routedFetch();
    const estimate = createEstimateCalories({
      getCredential: createCredentialSource({ getChatGPTAccessToken: () => Promise.resolve(null) }),
      onCredentialRejected: jest.fn(),
      fetch,
    });

    await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'missing-auth' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a request with neither text nor a photo before calling fetch', async () => {
    const { estimate, fetch } = setup();

    await expect(estimate({ text: '   ' })).rejects.toThrow('needs text or a photo');
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("on the signed-in user's ChatGPT plan", () => {
    it("asks the account's model catalog with the user's token, then estimates on the model it lists", async () => {
      const { estimate, fetch } = setup();

      await expect(estimate({ text: 'apple' })).resolves.toEqual(ESTIMATE);

      expect(callsTo(fetch, '/models')[0]?.[1]).toMatchObject({ method: 'GET', headers: { Authorization: `Bearer ${USER_TOKEN}` } });
      expect(callsTo(fetch, '/responses')[0]?.[1]).toMatchObject({ headers: { Authorization: `Bearer ${USER_TOKEN}` } });
      expect(sentBody(fetch).model).toBe('gpt-6.1-sol');
    });

    it('sends none of the fields the plan route refuses', async () => {
      const { estimate, fetch } = setup();

      await estimate({ text: 'apple' });

      expect(sentBody(fetch)).not.toHaveProperty('max_output_tokens');
      expect(JSON.stringify(sentBody(fetch).input)).not.toContain('"system"');
    });

    it('asks the catalog once per token, and again when the token is replaced', async () => {
      const { estimate, fetch, credential } = setup();

      await estimate({ text: 'apple' });
      await estimate({ text: 'pear' });
      credential.current = 'refreshed-token';
      await estimate({ text: 'fig' });

      expect(callsTo(fetch, '/models')).toHaveLength(2);
    });

    it("reads HTTP 429 as the plan's 'usage-limit'", async () => {
      const { estimate } = setup({ fetch: routedFetch({ stream: () => respond(429) }) });

      await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'usage-limit', status: 429 });
    });

    it("hands back a token OpenAI refuses, and retries once on the refreshed one", async () => {
      let calls = 0;
      const fetch = routedFetch({ stream: () => (calls++ === 0 ? respond(401) : respond(200, { text: completedStream(ESTIMATE) })) });
      const { estimate, credential, onCredentialRejected } = setup({ fetch });
      onCredentialRejected.mockImplementation(() => {
        credential.current = 'refreshed-token';
      });

      await expect(estimate({ text: 'apple' })).resolves.toEqual(ESTIMATE);

      expect(onCredentialRejected).toHaveBeenCalledWith(USER_TOKEN);
      expect(callsTo(fetch, '/responses')[1]?.[1]).toMatchObject({ headers: { Authorization: 'Bearer refreshed-token' } });
    });

    it("reads 'missing-auth' when the refused session cannot be refreshed", async () => {
      const { estimate, credential, onCredentialRejected } = setup({ fetch: routedFetch({ stream: () => respond(401) }) });
      onCredentialRejected.mockImplementation(() => {
        credential.current = null;
      });

      await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'missing-auth' });
    });

    it("gives up with 'api' 401 when the refreshed token is refused too", async () => {
      const { estimate, fetch, onCredentialRejected } = setup({ fetch: routedFetch({ stream: () => respond(401) }) });

      await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'api', status: 401 });

      expect(onCredentialRejected).toHaveBeenCalledTimes(1);
      expect(callsTo(fetch, '/responses')).toHaveLength(2);
    });

    it("reads HTTP 403 as 'plan-unavailable', not as a failure worth retrying", async () => {
      const { estimate, onCredentialRejected } = setup({ fetch: routedFetch({ stream: () => respond(403) }) });

      await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'plan-unavailable', status: 403 });
      expect(onCredentialRejected).not.toHaveBeenCalled();
    });

    it("reads a refused catalog request as 'api' with its status", async () => {
      const { estimate, fetch } = setup({ fetch: routedFetch({ catalog: () => respond(401) }) });

      await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'api', status: 401 });
      expect(callsTo(fetch, '/responses')).toHaveLength(0);
    });
  });

  it("maps a rejected fetch to 'network'", async () => {
    const { estimate } = setup({ fetch: jest.fn(() => Promise.reject(new TypeError('Network request failed'))) });

    const error = await caught(estimate({ text: 'apple' }));

    expect(error).toBeInstanceOf(EstimateError);
    expect(error).toMatchObject({ kind: 'network', status: null });
  });

  it("maps a stream that drops mid-body to 'network'", async () => {
    const fetch = routedFetch({
      stream: () =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.reject(new TypeError('Network request failed')) }),
    });
    const { estimate } = setup({ fetch });

    await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'network' });
  });

  it("maps a timeout to 'network' by aborting the request", async () => {
    jest.useFakeTimers();
    const started = { resolve: () => undefined as void };
    const fetchStarted = new Promise<void>((resolve) => {
      started.resolve = resolve;
    });
    const fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          started.resolve();
        }),
    );
    const { estimate } = setup({ fetch, timeoutMs: 1000 });

    const pending = caught(estimate({ text: 'apple' }));
    await fetchStarted;
    jest.advanceTimersByTime(1000);

    await expect(pending).resolves.toMatchObject({ kind: 'network' });
    jest.useRealTimers();
  });

  it("rejects with the caller's abort itself, not an EstimateError, when the caller aborts mid-request", async () => {
    const seen: { signal: AbortSignal | null } = { signal: null };
    const abortError = new Error('Aborted');
    const started = { resolve: () => undefined as void };
    const fetchStarted = new Promise<void>((resolve) => {
      started.resolve = resolve;
    });
    const fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          seen.signal = init.signal ?? null;
          init.signal?.addEventListener('abort', () => reject(abortError));
          started.resolve();
        }),
    );
    const { estimate } = setup({ fetch });
    const caller = new AbortController();

    const pending = caught(estimate({ text: 'apple' }, { signal: caller.signal }));
    await fetchStarted;
    caller.abort();

    await expect(pending).resolves.toBe(abortError);
    expect(seen.signal?.aborted).toBe(true);
  });

  it("rejects with the caller's abort, not an EstimateError, when the caller aborts while the credential is fetched", async () => {
    const caller = new AbortController();
    const estimate = createEstimateCalories({
      getCredential: () => {
        caller.abort();
        return Promise.reject(new EstimateError('network'));
      },
      onCredentialRejected: jest.fn(),
      fetch: routedFetch(),
    });

    const error = await caught(estimate({ text: 'apple' }, { signal: caller.signal }));

    expect(error).not.toBeInstanceOf(EstimateError);
  });

  it('never sends a request the caller already aborted', async () => {
    const fetch = jest.fn((_url: string, init: RequestInit) =>
      init.signal?.aborted === true ? Promise.reject(new Error('Aborted')) : respond(200, { text: completedStream(ESTIMATE) }),
    );
    const { estimate } = setup({ fetch });
    const caller = new AbortController();
    caller.abort();

    const error = await caught(estimate({ text: 'apple' }, { signal: caller.signal }));

    expect(error).not.toBeInstanceOf(EstimateError);
  });

  it("maps HTTP 500 to 'api' with the status, retrying nothing", async () => {
    const { estimate, fetch, onCredentialRejected } = setup({ fetch: routedFetch({ stream: () => respond(500) }) });

    await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'api', status: 500 });

    expect(onCredentialRejected).not.toHaveBeenCalled();
    expect(callsTo(fetch, '/responses')).toHaveLength(1);
  });

  it("maps a reply that breaks the schema to 'invalid-response'", async () => {
    const { estimate } = setup({ fetch: routedFetch({ stream: () => respond(200, { text: completedStream({ reply: 'Apple', kcal: 0 }) }) }) });

    await expect(estimate({ text: 'apple' })).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  describe('never lets a credential out', () => {
    // OpenAI's real 401 body quotes the token it was sent; the estimator must not read it into an error.
    const echoing = { json: { error: { message: `Incorrect API key provided: ${USER_TOKEN}` } }, text: USER_TOKEN };

    it.each([
      ['a 401 whose body echoes the token', routedFetch({ stream: () => respond(401, echoing) })],
      ['a 500', routedFetch({ stream: () => respond(500, echoing) })],
      ['a rejected fetch', jest.fn(() => Promise.reject(new TypeError('Network request failed')))],
      ['a malformed stream', routedFetch({ stream: () => respond(200, { text: `data: ${USER_TOKEN}\n\n` }) })],
      ['a refused catalog request', routedFetch({ catalog: () => respond(401, echoing) })],
      ['a usage limit', routedFetch({ stream: () => respond(429, echoing) })],
    ])('in the error from %s', async (_case, fetch) => {
      const { estimate } = setup({ fetch });

      const error = await caught(estimate({ text: 'apple' }));

      expect(error).toBeInstanceOf(EstimateError);
      expect(everyTextOf(error)).not.toContain(USER_TOKEN);
      expect(everyTextOf(error)).not.toContain('Bearer');
    });
  });
});
