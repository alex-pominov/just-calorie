import { useState } from 'react';

import type { ChatGPTSessionStatus } from '@/modules/chatgpt-auth';
import {
  ChatGPTAuthError,
  openChatGPTUsageSettings,
  signInWithChatGPT,
  signOutOfChatGPT,
  useChatGPTSessionStatus,
} from '@/modules/chatgpt-auth';

import {
  SIGN_OUT_FAILED_COPY,
  SIGN_OUT_UNCONFIRMED_COPY,
  signInFailedCopy,
  USAGE_UNAVAILABLE_COPY,
} from '../services/chatgpt-account-copy.service';

export interface ChatGPTAccount {
  readonly status: ChatGPTSessionStatus;
  /** The last sign-in, sign-out or settings outcome worth a line, or null. */
  readonly note: string | null;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly manageUsage: () => Promise<void>;
}

/** The ChatGPT sign-in as Track with AI shows it. A cancelled sign-in says nothing. */
export function useChatGPTAccount(): ChatGPTAccount {
  const status = useChatGPTSessionStatus();
  const [note, setNote] = useState<string | null>(null);

  const signIn = async () => {
    setNote(null);

    try {
      await signInWithChatGPT();
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

  return { status, note, signIn, signOut, manageUsage };
}
