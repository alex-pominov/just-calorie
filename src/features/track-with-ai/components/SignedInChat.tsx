import { useState } from 'react';
import { KeyboardAvoidingView } from 'react-native';

import { useTodayKey } from '@/features/tracking';
import { spacing } from '@/modules/theme';

import type { ChatGPTAccount } from '../hooks/useChatGPTAccount';
import { usePhotoDraft } from '../hooks/usePhotoDraft';
import { useTrackChat } from '../hooks/useTrackChat';
import { dayName } from '../services/chat-copy.service';
import { ChatGPTSignOutLink } from './ChatGPTSignOutLink';
import { ChatInputRow, INPUT_ROW_BOTTOM_PADDING } from './ChatInputRow';
import { ChatMessageList } from './ChatMessageList';

// With the keyboard up the input row sits this far above it (the spacing scale's 8pt step); its bottom padding is
// folded away.
const KEYBOARD_GAP = Number.parseFloat(spacing[2]);

interface SignedInChatProps {
  /** The day Add writes to: the day the main screen showed, never after today. */
  dayKey: string;
  headerHeight: number;
  account: ChatGPTAccount;
}

/**
 * Figma 24:4327: the chat, 'Sign Out from GPT', and the input row under it. It owns the chat, the typed draft and the
 * attached photo, so unmounting it discards all three and aborts any reply still in flight.
 */
export const SignedInChat = ({ dayKey, headerHeight, account }: SignedInChatProps) => {
  const chat = useTrackChat(dayKey);
  const day = dayName({ dayKey, todayKey: useTodayKey() });
  const photoDraft = usePhotoDraft();
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
    <KeyboardAvoidingView
      testID="signed-in-chat"
      behavior="padding"
      keyboardVerticalOffset={KEYBOARD_GAP - INPUT_ROW_BOTTOM_PADDING}
      className="flex-1"
    >
      <ChatMessageList
        messages={chat.messages}
        dayName={day}
        headerHeight={headerHeight}
        onAdd={(message) => void chat.add(message)}
        onOpenUsageSettings={() => void account.manageUsage()}
      />
      <ChatGPTSignOutLink account={account} />
      <ChatInputRow
        draft={draft}
        onChangeDraft={setDraft}
        photo={photoDraft.photo}
        onRemovePhoto={photoDraft.remove}
        note={photoDraft.note}
        canSend={canSend}
        onSend={send}
        onAttach={() => void photoDraft.attach()}
      />
    </KeyboardAvoidingView>
  );
};
