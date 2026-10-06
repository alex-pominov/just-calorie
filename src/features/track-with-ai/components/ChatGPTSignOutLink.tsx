import { Pressable, Text, View } from 'react-native';

import type { ChatGPTAccount } from '../hooks/useChatGPTAccount';
import { useKeyboardShown } from '../hooks/useKeyboardShown';
import { SIGN_OUT_FROM_GPT_COPY, SIGNING_OUT_COPY } from '../services/chatgpt-account-copy.service';

const LINK_TEXT = 'font-manrope-medium text-figure text-content-muted';
const NOTE_TEXT = 'text-center font-manrope-medium text-figure text-content-muted';

interface ChatGPTSignOutLinkProps {
  account: ChatGPTAccount;
}

/**
 * Figma 24:4327: 'Sign Out from GPT' just above the input section (D5, backlog 19), and the account's line under it (D3).
 * The keyboard covers the link rather than lifting it with the row, and the line stays, so it is never held back.
 */
export const ChatGPTSignOutLink = ({ account }: ChatGPTSignOutLinkProps) => {
  const isKeyboardShown = useKeyboardShown();
  const isSigningOut = account.status === 'signing-out';

  return (
    <View className="items-center gap-2">
      {isKeyboardShown ? null : (
        <Pressable
          testID="chatgpt-sign-out"
          accessibilityRole="button"
          accessibilityState={{ disabled: isSigningOut, busy: isSigningOut }}
          disabled={isSigningOut}
          onPress={() => void account.signOut()}
        >
          <Text className={LINK_TEXT}>{isSigningOut ? SIGNING_OUT_COPY : SIGN_OUT_FROM_GPT_COPY}</Text>
        </Pressable>
      )}
      {account.note === null ? null : (
        <Text accessibilityRole="alert" className={NOTE_TEXT}>
          {account.note}
        </Text>
      )}
    </View>
  );
};
