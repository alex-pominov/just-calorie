import { useEffect, useSyncExternalStore } from 'react';

import type { ChatGPTSessionStatus } from './chatgpt-auth.types';
import { chatGPTSession } from './chatgpt-session';

/** Where the ChatGPT sign-in stands, re-rendering on every change. The first render reads the Keychain. */
export function useChatGPTSessionStatus(): ChatGPTSessionStatus {
  const status = useSyncExternalStore(chatGPTSession.subscribe, chatGPTSession.getStatus);

  useEffect(() => {
    void chatGPTSession.load();
  }, []);

  return status;
}

/** Whether an account has registered on this phone, so a plain sign-in reuses it and another account can be offered. */
export function useHasSavedChatGPTAccount(): boolean {
  return useSyncExternalStore(chatGPTSession.subscribe, chatGPTSession.hasSavedAccount);
}
