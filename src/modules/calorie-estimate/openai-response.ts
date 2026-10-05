import type { CalorieEstimate } from './calorie-estimate.types';
import { EstimateError } from './estimate-error';

function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

const invalid = (cause?: unknown) => new EstimateError('invalid-response', { cause });

function readMessageContent(body: unknown): unknown {
  if (prop(body, 'status') !== 'completed') throw invalid();

  const output = prop(body, 'output');
  const message = Array.isArray(output) ? output.find((item: unknown) => prop(item, 'type') === 'message') : undefined;
  const content = prop(message, 'content');

  return Array.isArray(content) ? content.find((part: unknown) => ['output_text', 'refusal'].includes(String(prop(part, 'type')))) : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw invalid(error);
  }
}

// A kcal is a whole number of at least 1, or null. Anything else (0, a negative, a fraction, a string)
// breaks the schema the request demanded, so the whole response is refused rather than repaired.
function readKcal(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) return value;

  throw invalid();
}

function readReply(value: unknown): string {
  const reply = typeof value === 'string' ? value.trim() : '';

  if (reply === '') throw invalid();

  return reply;
}

/**
 * Turns a Responses API body into an estimate. A refusal becomes its sentence with no kcal; an
 * incomplete response, a missing message or a reply that breaks the schema throws 'invalid-response'.
 */
export function parseEstimateResponse(body: unknown): CalorieEstimate {
  const part = readMessageContent(body);

  if (prop(part, 'type') === 'refusal') {
    return { reply: readReply(prop(part, 'refusal')), kcal: null };
  }

  const text = prop(part, 'text');

  if (typeof text !== 'string') throw invalid();

  const estimate = parseJson(text);

  return { reply: readReply(prop(estimate, 'reply')), kcal: readKcal(prop(estimate, 'kcal')) };
}
