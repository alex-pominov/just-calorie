import { useState } from 'react';

import type { ChatGPTSessionStatus } from '@/modules/chatgpt-auth';
import {
  ChatGPTAuthError,
  openChatGPTUsageSettings,
  signInWithChatGPT,
  signOutOfChatGPT,
  useChatGPTSessionStatus,
  useHasSavedChatGPTAccount,
} from '@/modules/chatgpt-auth';

import {
  SIGN_OUT_FAILED_COPY,
  SIGN_OUT_UNCONFIRMED_COPY,
  signInFailedCopy,
  USAGE_UNAVAILABLE_COPY,
} from '../services/chatgpt-account-copy.service';

export interface ChatGPTAccount {
  readonly status: ChatGPTSessionStatus;
  /** An account has signed in on this phone before: the pill reuses it, and another account can be added. */
  readonly hasSavedAccount: boolean;
  /** The last sign-in, sign-out or settings outcome worth a line, or null. */
  readonly note: string | null;
  readonly signIn: () => Promise<void>;
  /** Signs in a ChatGPT account other than the saved one, registering its own client. */
  readonly signInWithAnotherAccount: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly manageUsage: () => Promise<void>;
}

/** The ChatGPT sign-in as Track with AI shows it. A cancelled sign-in says nothing. */
export function useChatGPTAccount(): ChatGPTAccount {
  const status = useChatGPTSessionStatus();
  const hasSavedAccount = useHasSavedChatGPTAccount();
  const [note, setNote] = useState<string | null>(null);

  const startSignIn = async (newAccount: boolean) => {
    setNote(null);

    try {
      await signInWithChatGPT({ newAccount });
    } catch (error) {
      setNote(signInFailedCopy(error instanceof ChatGPTAuthError ? error.kind : 'failed'));
    }
  };

  const signOut = async () => {
    setNote(null);

    try {
      const { revoked } = await signOutOfChatGPT();
      if (!revoked) setNote(SIGN_OUT_UNCONFIRMED_COPY);
    } catch {
      setNote(SIGN_OUT_FAILED_COPY);
    }
  };

  const manageUsage = async () => {
    try {
      await openChatGPTUsageSettings();
    } catch {
      setNote(USAGE_UNAVAILABLE_COPY);
    }
  };

  return {
    status,
    hasSavedAccount,
    note,
    signIn: () => startSignIn(false),
    signInWithAnotherAccount: () => startSignIn(true),
    signOut,
    manageUsage,
  };
}
