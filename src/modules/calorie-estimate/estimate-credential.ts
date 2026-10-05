import { ChatGPTAuthError } from '@/modules/chatgpt-auth';

import type { EstimateCredential } from './calorie-estimate.types';
import { EstimateError } from './estimate-error';

export interface CredentialSourceDependencies {
  readonly getChatGPTAccessToken: () => Promise<string | null>;
  readonly getDevApiKey: () => string | null;
}

/** The signed-in user's ChatGPT token first; a development build's key only when nobody is signed in. */
export function createCredentialSource(dependencies: CredentialSourceDependencies): () => Promise<EstimateCredential | null> {
  return async function currentCredential() {
    let token: string | null;

    try {
      token = await dependencies.getChatGPTAccessToken();
    } catch (error) {
      // A refresh that failed leaves the user signed in, so the line must not ask them to sign in again.
      if (error instanceof ChatGPTAuthError) throw new EstimateError('network', { cause: error });
      throw error;
    }

    if (token !== null) return { kind: 'chatgpt-plan', token };

    const devApiKey = dependencies.getDevApiKey();

    return devApiKey === null ? null : { kind: 'api-key', token: devApiKey };
  };
}
