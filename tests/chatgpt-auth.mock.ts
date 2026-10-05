import { useSyncExternalStore } from 'react';

import type { ChatGPTSessionStatus } from '@/modules/chatgpt-auth';
import type * as AuthErrorModule from '@/modules/chatgpt-auth/chatgpt-auth-error';

interface MockChatGPTAccount {
  status: ChatGPTSessionStatus;
  hasSavedAccount: boolean;
}

/** What the mocked '@/modules/chatgpt-auth' reports; a screen test sets it before rendering. */
export const mockChatGPTAccount: MockChatGPTAccount = {
  status: 'signed-in',
  hasSavedAccount: true,
};

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

/** Changes the mocked session while a screen is rendered, as the real session does when it signs in or out. */
export function setMockChatGPTAccount(change: Partial<MockChatGPTAccount>): void {
  Object.assign(mockChatGPTAccount, change);
  listeners.forEach((listener) => listener());
}

/**
 * '@/modules/chatgpt-auth' for a test of a screen that shows the sign-in: the session's state comes from
 * `mockChatGPTAccount`, and every call is a mock. Use it as jest.mock's factory result.
 */
export const chatGPTAuthMock = {
  ChatGPTAuthError: jest.requireActual<typeof AuthErrorModule>('@/modules/chatgpt-auth/chatgpt-auth-error').ChatGPTAuthError,
  useChatGPTSessionStatus: () => useSyncExternalStore(subscribe, () => mockChatGPTAccount.status),
  useHasSavedChatGPTAccount: () => useSyncExternalStore(subscribe, () => mockChatGPTAccount.hasSavedAccount),
  signInWithChatGPT: jest.fn(() => Promise.resolve('signed-in')),
  signOutOfChatGPT: jest.fn(() => Promise.resolve({ revoked: true })),
  openChatGPTUsageSettings: jest.fn(() => Promise.resolve()),
  getChatGPTAccessToken: jest.fn(() => Promise.resolve(null)),
  rejectChatGPTAccessToken: jest.fn(),
};
