import { Pressable, Text, View } from 'react-native';

import type { ChatGPTAccount } from '../hooks/useChatGPTAccount';
import { SIGN_OUT_FROM_GPT_COPY, SIGNING_OUT_COPY } from '../services/chatgpt-account-copy.service';

const LINK_TEXT = 'font-manrope-medium text-figure text-content-muted';
const NOTE_TEXT = 'text-center font-manrope-medium text-figure text-content-muted';

interface ChatGPTSignOutLinkProps {
  account: ChatGPTAccount;
}

/** Figma 24:4327: 'Sign Out from GPT' under the input row (D5), and a failed sign-out's line under it (D3). */
export const ChatGPTSignOutLink = ({ account }: ChatGPTSignOutLinkProps) => {
  const isSigningOut = account.status === 'signing-out';

  return (
    <View className="items-center gap-2 pt-2">
      <Pressable
        testID="chatgpt-sign-out"
        accessibilityRole="button"
        accessibilityState={{ disabled: isSigningOut, busy: isSigningOut }}
        disabled={isSigningOut}
        onPress={() => void account.signOut()}
      >
        <Text className={LINK_TEXT}>{isSigningOut ? SIGNING_OUT_COPY : SIGN_OUT_FROM_GPT_COPY}</Text>
      </Pressable>
      {account.note === null ? null : (
        <Text accessibilityRole="alert" className={NOTE_TEXT}>
          {account.note}
        </Text>
      )}
    </View>
  );
};
