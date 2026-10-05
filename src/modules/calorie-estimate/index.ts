import { getChatGPTAccessToken, rejectChatGPTAccessToken } from '@/modules/chatgpt-auth';

import { createEstimateCalories } from './estimate-calories';
import { createCredentialSource } from './estimate-credential';

export { EstimateError } from './estimate-error';
export type {
  CalorieEstimate,
  CalorieEstimateRequest,
  EstimateErrorKind,
  EstimateOptions,
  EstimatePhoto,
} from './calorie-estimate.types';

/** Asks for a calorie estimate of text, a photo, or both. Throws `EstimateError` on every failure. */
export const estimateCalories = createEstimateCalories({
  getCredential: createCredentialSource({ getChatGPTAccessToken }),
  onCredentialRejected: rejectChatGPTAccessToken,
  fetch: (url, init) => fetch(url, init),
});
