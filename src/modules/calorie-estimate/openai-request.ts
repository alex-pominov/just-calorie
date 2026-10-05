import type { CalorieEstimateRequest } from './calorie-estimate.types';

/** The model the app asks for. Cheap, current and vision-capable (OpenAI model catalog, 2026-10-04). */
export const ESTIMATE_MODEL = 'gpt-6-luna';

export const RESPONSES_PATH = '/responses';

// REPLY LANGUAGE: the owner ruled (a) on 2026-10-04, request [0], to reply in the user's language. English for a
// photo sent alone is this module's own default, where the ruling is silent.
const REPLY_LANGUAGE_RULE =
  'Write "reply" in the language the user wrote in. If the user sent only a photo, write it in English.';

const SYSTEM_PROMPT = [
  'You estimate the calories in food and drink for a calorie-tracking app.',
  'The user sends a description of what they ate, a photo of it, or both.',
  'Estimate the total energy of everything described or shown, in kilocalories, as one whole number.',
  '"reply" is one or two short sentences naming the food and the portion you assumed; "kcal" is the total.',
  'If nothing with calories is recognisable, set "kcal" to null and say so in "reply".',
  REPLY_LANGUAGE_RULE,
].join('\n');

const ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    kcal: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
  },
  required: ['reply', 'kcal'],
  additionalProperties: false,
} as const;

function userContent(request: CalorieEstimateRequest) {
  const text = request.text?.trim() ?? '';
  const parts: ({ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' })[] = [];

  if (text !== '') parts.push({ type: 'input_text', text });

  if (request.photo !== undefined) {
    parts.push({
      type: 'input_image',
      image_url: `data:${request.photo.mimeType};base64,${request.photo.base64}`,
      detail: 'low',
    });
  }

  return parts;
}

// The ChatGPT plan route's contract: `instructions` instead of a system message (it rejects one), `stream: true`,
// `store: false`, and no `max_output_tokens`, which it refuses.
/** The Responses API body for one estimate. Nothing is stored on OpenAI's side (`store: false`). */
export function buildEstimateRequestBody(request: CalorieEstimateRequest, options: { readonly model: string }) {
  return {
    model: options.model,
    instructions: SYSTEM_PROMPT,
    input: [{ role: 'user', content: userContent(request) }],
    text: { format: { type: 'json_schema', name: 'calorie_estimate', strict: true, schema: ESTIMATE_SCHEMA } },
    reasoning: { effort: 'low' },
    store: false,
    stream: true,
  };
}

/** True when the request carries something to estimate: non-blank text, a photo, or both. */
export function hasEstimateInput(request: CalorieEstimateRequest): boolean {
  return (request.text?.trim() ?? '') !== '' || request.photo !== undefined;
}
