import { Pressable, Text, View } from 'react-native';

import type { ChatGPTSessionStatus } from '@/modules/chatgpt-auth';

import { useChatGPTAccount } from '../hooks/useChatGPTAccount';
import {
  CONTINUE_WITH_CHATGPT_COPY,
  MANAGE_USAGE_COPY,
  SIGN_OUT_COPY,
  SIGNING_IN_COPY,
  SIGNING_OUT_COPY,
  USING_PLAN_COPY,
} from '../services/chatgpt-account-copy.service';

/** What the pill says in each state; it is pressable only when it offers to continue. */
const PILL_COPY = {
  loading: CONTINUE_WITH_CHATGPT_COPY,
  'signed-out': CONTINUE_WITH_CHATGPT_COPY,
  'signing-in': SIGNING_IN_COPY,
  'signing-out': SIGNING_OUT_COPY,
  'signed-in': CONTINUE_WITH_CHATGPT_COPY,
} as const satisfies Record<ChatGPTSessionStatus, string>;

/**
 * Undrawn in Figma, built from tokens. Signed out: the white 'Continue with ChatGPT' pill. Signed in: the plan line
 * with Manage usage and Sign out. Nothing until the Keychain has been read, so the pill never flashes for a user.
 */
export const ChatGPTAccountRow = () => {
  const account = useChatGPTAccount();
  const isBusy = account.status === 'signing-in' || account.status === 'signing-out';

  if (account.status === 'loading') return null;

  return (
    <View testID="chatgpt-account" className="gap-2 px-4 pt-2">
      {account.status === 'signed-in' ? (
        <View className="flex-row items-center justify-center gap-4">
          <Text className="font-manrope-regular text-label text-content-secondary">{USING_PLAN_COPY}</Text>
          <Pressable testID="chatgpt-manage-usage" accessibilityRole="button" onPress={() => void account.manageUsage()}>
            <Text className="font-manrope-semibold text-label text-primary">{MANAGE_USAGE_COPY}</Text>
          </Pressable>
          <Pressable testID="chatgpt-sign-out" accessibilityRole="button" onPress={() => void account.signOut()}>
            <Text className="font-manrope-semibold text-label text-primary">{SIGN_OUT_COPY}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          testID="chatgpt-continue"
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy, busy: isBusy }}
          disabled={isBusy}
          onPress={() => void account.signIn()}
          className="h-12 items-center justify-center rounded-full bg-primary"
        >
          <Text className="font-manrope-bold text-body-tight text-ink-900">{PILL_COPY[account.status]}</Text>
        </Pressable>
      )}
      {account.note === null ? null : (
        <Text accessibilityRole="alert" className="font-manrope-regular text-label text-content-secondary">
          {account.note}
        </Text>
      )}
    </View>
  );
};
