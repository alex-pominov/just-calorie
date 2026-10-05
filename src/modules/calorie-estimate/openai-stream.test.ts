import { parseEstimateStream } from './openai-stream';

const completedResponse = (estimate: unknown) => ({
  status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(estimate) }] }],
});

const sse = (events: readonly Record<string, unknown>[], lineEnd = '\n') =>
  events.map((event) => `event: ${String(event.type)}${lineEnd}data: ${JSON.stringify(event)}${lineEnd}${lineEnd}`).join('');

const ESTIMATE = { reply: 'An apple, about 95 kcal.', kcal: 95 };

describe('parseEstimateStream', () => {
  it('reads the estimate from the completed response at the end of the stream', () => {
    const stream = sse([
      { type: 'response.created', response: { status: 'in_progress' } },
      { type: 'response.output_text.delta', delta: '{"reply"' },
      { type: 'response.completed', response: completedResponse(ESTIMATE) },
    ]);

    expect(parseEstimateStream(stream)).toEqual(ESTIMATE);
  });

  it('reads the message from its output_item.done event when the completed response leaves output empty, as the ChatGPT plan route does', () => {
    const message = completedResponse(ESTIMATE).output[0];
    const stream = sse([
      { type: 'response.created', response: { status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', item: { type: 'message', content: [] } },
      { type: 'response.output_text.delta', delta: '{"reply"' },
      { type: 'response.output_text.done', text: JSON.stringify(ESTIMATE) },
      { type: 'response.output_item.done', item: message },
      { type: 'response.completed', response: { status: 'completed', output: [] } },
    ]);

    expect(parseEstimateStream(stream)).toEqual(ESTIMATE);
  });

  it("reads 'invalid-response' when neither the completed response nor any finished item holds a message", () => {
    const stream = sse([{ type: 'response.completed', response: { status: 'completed', output: [] } }]);

    expect(() => parseEstimateStream(stream)).toThrow(expect.objectContaining({ kind: 'invalid-response' }));
  });

  it("reads a stream cut in the middle of an event as 'network', not as an unreadable reply", () => {
    const stream = `${sse([{ type: 'response.created' }])}data: {"type":"response.output_text.del`;

    expect(() => parseEstimateStream(stream)).toThrow(expect.objectContaining({ kind: 'network' }));
  });

  it.each([
    ['CRLF', '\r\n'],
    ['CR', '\r'],
  ])('reads a stream whose lines end in %s', (_case, lineEnd) => {
    expect(parseEstimateStream(sse([{ type: 'response.completed', response: completedResponse(ESTIMATE) }], lineEnd))).toEqual(ESTIMATE);
  });

  it('joins an event whose data spans several lines', () => {
    const json = JSON.stringify({ type: 'response.completed', response: completedResponse(ESTIMATE) }, null, 2);
    const stream = `event: response.completed\n${json
      .split('\n')
      .map((line) => `data: ${line}`)
      .join('\n')}\n\n`;

    expect(parseEstimateStream(stream)).toEqual(ESTIMATE);
  });

  it('ignores comments and the [DONE] marker', () => {
    const stream = `: keep-alive\n\n${sse([{ type: 'response.completed', response: completedResponse(ESTIMATE) }])}data: [DONE]\n\n`;

    expect(parseEstimateStream(stream)).toEqual(ESTIMATE);
  });

  it.each([
    ['response.failed', { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }],
    ['an error event', { type: 'error', code: 'subscription_sharing_usage_limit_exceeded' }],
  ])("reads a usage limit reported in %s as 'usage-limit'", (_case, event) => {
    expect(() => parseEstimateStream(sse([event]))).toThrow(expect.objectContaining({ kind: 'usage-limit' }));
  });

  it.each([
    ['response.failed', { type: 'response.failed', response: { error: { code: 'server_error' } } }],
    ['an error event', { type: 'error', error: { code: 'subscription_sharing_unsupported_capability' } }],
  ])("reads any other failure in %s as 'api'", (_case, event) => {
    expect(() => parseEstimateStream(sse([event]))).toThrow(expect.objectContaining({ kind: 'api', status: null }));
  });

  it("reads a response cut short (response.incomplete) as 'invalid-response'", () => {
    expect(() => parseEstimateStream(sse([{ type: 'response.incomplete', response: { status: 'incomplete' } }]))).toThrow(
      expect.objectContaining({ kind: 'invalid-response' }),
    );
  });

  it("reads a stream that ends with no terminal event as 'network'", () => {
    expect(() => parseEstimateStream(sse([{ type: 'response.created' }, { type: 'response.output_text.delta', delta: '{' }]))).toThrow(
      expect.objectContaining({ kind: 'network' }),
    );
  });

  it('returns the completed estimate even when the connection garbles what follows it', () => {
    const stream = `${sse([{ type: 'response.completed', response: completedResponse(ESTIMATE) }])}data: {"type":"respo`;

    expect(parseEstimateStream(stream)).toEqual(ESTIMATE);
  });

  it("reads an event that is not JSON as 'invalid-response'", () => {
    expect(() => parseEstimateStream('data: {not json\n\n')).toThrow(expect.objectContaining({ kind: 'invalid-response' }));
  });

  it("reads a completed response that breaks the estimate's schema as 'invalid-response'", () => {
    const stream = sse([{ type: 'response.completed', response: completedResponse({ reply: 'Apple', kcal: 0 }) }]);

    expect(() => parseEstimateStream(stream)).toThrow(expect.objectContaining({ kind: 'invalid-response' }));
  });
});
