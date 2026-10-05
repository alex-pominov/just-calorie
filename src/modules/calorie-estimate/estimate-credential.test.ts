import { ChatGPTAuthError } from '@/modules/chatgpt-auth';

import { createCredentialSource } from './estimate-credential';

describe('the estimate credential', () => {
  it("is the signed-in user's ChatGPT token", async () => {
    const credential = createCredentialSource({ getChatGPTAccessToken: () => Promise.resolve('user-token') });

    await expect(credential()).resolves.toBe('user-token');
  });

  it('is nothing when nobody is signed in, whatever the build', async () => {
    const credential = createCredentialSource({ getChatGPTAccessToken: () => Promise.resolve(null) });

    await expect(credential()).resolves.toBeNull();
  });

  it.each(['network', 'failed'] as const)("reads a sign-in refresh that ended in '%s' as 'network'", async (kind) => {
    const credential = createCredentialSource({ getChatGPTAccessToken: () => Promise.reject(new ChatGPTAuthError(kind)) });

    await expect(credential()).rejects.toMatchObject({ name: 'EstimateError', kind: 'network' });
  });
});
