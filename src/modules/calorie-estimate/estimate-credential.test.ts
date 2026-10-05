import { ChatGPTAuthError } from '@/modules/chatgpt-auth';

import { createCredentialSource } from './estimate-credential';

describe('the estimate credential', () => {
  it("uses the signed-in user's ChatGPT token, even when a dev key is configured", async () => {
    const credential = createCredentialSource({ getChatGPTAccessToken: () => Promise.resolve('user-token'), getDevApiKey: () => 'sk-dev' });

    await expect(credential()).resolves.toEqual({ kind: 'chatgpt-plan', token: 'user-token' });
  });

  it('falls back to the dev key only when nobody is signed in', async () => {
    const credential = createCredentialSource({ getChatGPTAccessToken: () => Promise.resolve(null), getDevApiKey: () => 'sk-dev' });

    await expect(credential()).resolves.toEqual({ kind: 'api-key', token: 'sk-dev' });
  });

  it('has nothing to offer a production build nobody has signed in to: no key and no other account', async () => {
    const credential = createCredentialSource({ getChatGPTAccessToken: () => Promise.resolve(null), getDevApiKey: () => null });

    await expect(credential()).resolves.toBeNull();
  });

  it("reads a sign-in refresh that could not reach OpenAI as 'network'", async () => {
    const credential = createCredentialSource({
      getChatGPTAccessToken: () => Promise.reject(new ChatGPTAuthError('network')),
      getDevApiKey: () => 'sk-dev',
    });

    await expect(credential()).rejects.toMatchObject({ name: 'EstimateError', kind: 'network' });
  });

  it("reads a refresh that failed any other way as 'network' too, never as a reason to use the dev key", async () => {
    const credential = createCredentialSource({
      getChatGPTAccessToken: () => Promise.reject(new ChatGPTAuthError('failed')),
      getDevApiKey: () => 'sk-dev',
    });

    await expect(credential()).rejects.toMatchObject({ kind: 'network' });
  });
});
