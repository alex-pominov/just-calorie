import { getChatGPTAccessToken, rejectChatGPTAccessToken } from '@/modules/chatgpt-auth';

import { createEstimateCalories } from './estimate-calories';
import { getEstimateConfig } from './estimate-config';
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
  getCredential: createCredentialSource({ getChatGPTAccessToken, getDevApiKey: () => getEstimateConfig().devApiKey }),
  onCredentialRejected: (credential) => {
    if (credential.kind === 'chatgpt-plan') rejectChatGPTAccessToken(credential.token);
  },
  getBaseUrl: () => getEstimateConfig().baseUrl,
  fetch: (url, init) => fetch(url, init),
});
