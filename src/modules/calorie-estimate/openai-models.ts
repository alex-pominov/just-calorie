import { EstimateError } from './estimate-error';
import { ESTIMATE_MODEL } from './openai-request';

/** Lists the models a ChatGPT account may use; the plan route refuses any other. */
export const MODELS_PATH = '/models';

function prop(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;
}

/** The app's own model when the account lists it, else the first model the account lists, in the server's order. */
export function chooseEstimateModel(catalog: unknown): string {
  const models = prop(catalog, 'models');

  if (!Array.isArray(models)) throw new EstimateError('invalid-response');

  const listed = models
    .filter((model: unknown) => prop(model, 'visibility') === 'list')
    .map((model: unknown) => prop(model, 'slug'))
    .filter((slug): slug is string => typeof slug === 'string' && slug.trim() !== '');
  const chosen = listed.includes(ESTIMATE_MODEL) ? ESTIMATE_MODEL : listed[0];

  if (chosen === undefined) throw new EstimateError('invalid-response');

  return chosen;
}
