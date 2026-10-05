import { useState } from 'react';
import { View } from 'react-native';

import { closeSheet } from '@/utils/close-sheet';

import { useChatGPTAccount } from '../hooks/useChatGPTAccount';
import { ChatGPTSignInPrompt } from './ChatGPTSignInPrompt';
import { SignedInChat } from './SignedInChat';
import { TrackHeader } from './TrackHeader';

interface TrackWithAiScreenProps {
  /** The day Add writes to: the day the main screen showed, never after today. */
  dayKey: string;
}

/**
 * Signed out, Figma 24:4273: the header and the sign-in prompt alone. Signed in, Figma 24:4327: the chat. Until the
 * Keychain is read, the header alone, so neither state flashes (D6). The header is first in the tree and stays painted
 * above the rest by its z-index.
 */
export const TrackWithAiScreen = ({ dayKey }: TrackWithAiScreenProps) => {
  const account = useChatGPTAccount();
  const [headerHeight, setHeaderHeight] = useState(0);

  const isSignedOut = account.status === 'signed-out' || account.status === 'signing-in';

  return (
    <View className="flex-1 bg-ink-900">
      <TrackHeader onClose={closeSheet} onHeightChange={setHeaderHeight} />
      {account.status === 'loading' ? null : isSignedOut ? (
        <ChatGPTSignInPrompt account={account} />
      ) : (
        // Keyed on the status: leaving signed-in remounts the chat, which drops its messages and aborts a reply fetched
        // with the old session's token, so the next sign-in, maybe another account, starts at 24:4327 (qa f-d56e21).
        <SignedInChat key={account.status} dayKey={dayKey} headerHeight={headerHeight} account={account} />
      )}
    </View>
  );
};
