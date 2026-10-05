import { ChatGPTAuthError } from '@/modules/chatgpt-auth';

import { EstimateError } from './estimate-error';

export interface CredentialSourceDependencies {
  readonly getChatGPTAccessToken: () => Promise<string | null>;
}

/** The signed-in user's ChatGPT access token, or null when nobody is signed in. */
export function createCredentialSource(dependencies: CredentialSourceDependencies): () => Promise<string | null> {
  return async function currentCredential() {
    try {
      return await dependencies.getChatGPTAccessToken();
    } catch (error) {
      // A refresh that failed leaves the user signed in, so the line must not ask them to sign in again.
      if (error instanceof ChatGPTAuthError) throw new EstimateError('network', { cause: error });
      throw error;
    }
  };
}
