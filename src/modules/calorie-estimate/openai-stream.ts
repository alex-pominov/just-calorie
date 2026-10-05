import type { CalorieEstimate } from './calorie-estimate.types';
import { EstimateError } from './estimate-error';
import { parseEstimateResponse } from './openai-response';

// The ChatGPT plan route's code for "this user's plan, or this app's share of it, is used up".
const USAGE_LIMIT_CODES = new Set(['subscription_sharing_usage_limit_exceeded']);

function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

// Server-sent events: blank-line separated, each `data:` line one line of the event's JSON. Events are parsed one at
// a time, so a connection garbled after the terminal event cannot spoil it, and the text after the last blank line is
// an event the connection cut short, never parsed. Only a failure's code is read.
function* readEvents(text: string): Generator<unknown> {
  const blocks = text.replace(/\r\n?/g, '\n').split('\n\n');

  for (const block of blocks.slice(0, -1)) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).replace(/^ /, ''))
      .join('\n');

    if (data === '' || data === '[DONE]') continue;

    try {
      yield JSON.parse(data);
    } catch (error) {
      throw new EstimateError('invalid-response', { cause: error });
    }
  }
}

const failureOf = (code: unknown) => new EstimateError(USAGE_LIMIT_CODES.has(String(code)) ? 'usage-limit' : 'api');

// The ChatGPT plan route ends with a `response.completed` whose `output` is empty (measured 2026-10-04): the message
// arrives only in its `response.output_item.done` event, so the finished items stand in for an empty output.
function withFinishedItems(response: unknown, finished: readonly unknown[]): unknown {
  const output = prop(response, 'output');

  if (Array.isArray(output) && output.length > 0) return response;

  return typeof response === 'object' && response !== null ? { ...response, output: finished } : response;
}

/** Reads a Responses API event stream to its terminal event. Success is `response.completed` and nothing else. */
export function parseEstimateStream(text: string): CalorieEstimate {
  const finished: unknown[] = [];

  for (const event of readEvents(text)) {
    switch (prop(event, 'type')) {
      case 'response.output_item.done':
        finished.push(prop(event, 'item'));
        break;
      case 'response.completed':
        return parseEstimateResponse(withFinishedItems(prop(event, 'response'), finished));
      case 'response.failed':
        throw failureOf(prop(prop(prop(event, 'response'), 'error'), 'code'));
      case 'error':
        throw failureOf(prop(event, 'code') ?? prop(prop(event, 'error'), 'code'));
      case 'response.incomplete':
        throw new EstimateError('invalid-response');
    }
  }

  // The stream closed before a terminal event: the connection, not the model, ended it.
  throw new EstimateError('network');
}
