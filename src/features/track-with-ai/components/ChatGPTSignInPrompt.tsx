import { Pressable, Text, View } from 'react-native';

import type { ChatGPTAccount } from '../hooks/useChatGPTAccount';
import {
  SIGN_IN_PROMPT_COPY,
  SIGN_IN_WITH_CHATGPT_COPY,
  SIGNING_IN_COPY,
  USE_ANOTHER_ACCOUNT_COPY,
} from '../services/chatgpt-account-copy.service';

const LINK_TEXT = 'font-manrope-medium text-figure text-content-muted';
const NOTE_TEXT = 'text-center font-manrope-medium text-figure text-content-muted';

interface ChatGPTSignInPromptProps {
  account: ChatGPTAccount;
}

/**
 * Figma 24:4273, signed out: one centred column, the line above the white pill (gap 20). Under it, once an account has
 * signed in on this phone, the link to add another (D2), and the last outcome's line (D3).
 */
export const ChatGPTSignInPrompt = ({ account }: ChatGPTSignInPromptProps) => {
  const isSigningIn = account.status === 'signing-in';

  return (
    <View testID="chatgpt-sign-in" className="flex-1 items-center justify-center gap-5 px-4">
      <Text className="text-center font-manrope-semibold text-body text-primary">{SIGN_IN_PROMPT_COPY}</Text>
      <Pressable
        testID="chatgpt-sign-in-button"
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningIn, busy: isSigningIn }}
        disabled={isSigningIn}
        onPress={() => void account.signIn()}
        className="items-center justify-center rounded-full bg-primary px-5 py-3"
      >
        <Text className="font-manrope-bold text-body-tight text-ink-900">
          {isSigningIn ? SIGNING_IN_COPY : SIGN_IN_WITH_CHATGPT_COPY}
        </Text>
      </Pressable>
      {account.hasSavedAccount && !isSigningIn ? (
        <Pressable testID="chatgpt-use-another-account" accessibilityRole="button" onPress={() => void account.signInWithAnotherAccount()}>
          <Text className={LINK_TEXT}>{USE_ANOTHER_ACCOUNT_COPY}</Text>
        </Pressable>
      ) : null}
      {account.note === null ? null : (
        <Text accessibilityRole="alert" className={NOTE_TEXT}>
          {account.note}
        </Text>
      )}
    </View>
  );
};
