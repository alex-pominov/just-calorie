import { useState } from 'react';
import { KeyboardAvoidingView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTodayKey } from '@/features/tracking';
import { spacing } from '@/modules/theme';

import type { ChatGPTAccount } from '../hooks/useChatGPTAccount';
import { usePhotoDraft } from '../hooks/usePhotoDraft';
import { useTrackChat } from '../hooks/useTrackChat';
import { dayName, NEW_CHAT_PROMPT_COPY } from '../services/chat-copy.service';
import { ChatGPTSignOutLink } from './ChatGPTSignOutLink';
import { ChatInputRow } from './ChatInputRow';
import { ChatMessageList } from './ChatMessageList';

// With the keyboard up the input row sits this far above it (the spacing scale's 8pt step); its
// home-indicator padding is folded away.
const KEYBOARD_GAP = Number.parseFloat(spacing[2]);

interface SignedInChatProps {
  /** The day Add writes to: the day the main screen showed, never after today. */
  dayKey: string;
  headerHeight: number;
  account: ChatGPTAccount;
}

/**
 * Figma 24:4327: the chat, its empty prompt, and the input row with 'Sign Out from GPT' under it. It owns the chat,
 * the typed draft and the attached photo, so unmounting it discards all three and aborts any reply still in flight.
 */
export const SignedInChat = ({ dayKey, headerHeight, account }: SignedInChatProps) => {
  const chat = useTrackChat(dayKey);
  const day = dayName({ dayKey, todayKey: useTodayKey() });
  const photoDraft = usePhotoDraft();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  const canSend = (draft.trim() !== '' || photoDraft.photo !== null) && !chat.isAwaitingReply;

  const send = () => {
    if (!canSend) return;

    const photo = photoDraft.photo;
    setDraft('');
    photoDraft.clear();
    void chat.send({ text: draft, photo });
  };

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={KEYBOARD_GAP - insets.bottom} className="flex-1">
      <ChatMessageList
        messages={chat.messages}
        dayName={day}
        headerHeight={headerHeight}
        onAdd={(message) => void chat.add(message)}
        onOpenUsageSettings={() => void account.manageUsage()}
      />
      {chat.messages.length === 0 ? (
        <View testID="new-chat-prompt" className="pointer-events-none absolute inset-0 items-center justify-center px-4">
          <Text className="text-center font-manrope-medium text-title text-primary">{NEW_CHAT_PROMPT_COPY}</Text>
        </View>
      ) : null}
      <ChatInputRow
        draft={draft}
        onChangeDraft={setDraft}
        photo={photoDraft.photo}
        onRemovePhoto={photoDraft.remove}
        note={photoDraft.note}
        canSend={canSend}
        onSend={send}
        onAttach={() => void photoDraft.attach()}
        footer={<ChatGPTSignOutLink account={account} />}
      />
    </KeyboardAvoidingView>
  );
};
