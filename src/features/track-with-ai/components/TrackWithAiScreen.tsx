import { useState } from 'react';
import { KeyboardAvoidingView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTodayKey } from '@/features/tracking';
import { spacing } from '@/modules/theme';
import { closeSheet } from '@/utils/close-sheet';

import { usePhotoDraft } from '../hooks/usePhotoDraft';
import { useTrackChat } from '../hooks/useTrackChat';
import { dayName } from '../services/chat-copy.service';
import { ChatGPTAccountRow } from './ChatGPTAccountRow';
import { ChatInputRow } from './ChatInputRow';
import { ChatMessageList } from './ChatMessageList';
import { TrackHeader } from './TrackHeader';

// With the keyboard up the input row sits this far above it (the spacing scale's 8pt step); its
// home-indicator padding is folded away.
const KEYBOARD_GAP = Number.parseFloat(spacing[2]);

interface TrackWithAiScreenProps {
  /** The day Add writes to: the day the main screen showed, never after today. */
  dayKey: string;
}

/** The header is first in the tree and stays painted above the chat by its z-index. */
export const TrackWithAiScreen = ({ dayKey }: TrackWithAiScreenProps) => {
  const chat = useTrackChat(dayKey);
  const day = dayName({ dayKey, todayKey: useTodayKey() });
  const photoDraft = usePhotoDraft();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
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
    <View className="flex-1 bg-ink-900">
      <TrackHeader onClose={closeSheet} onHeightChange={setHeaderHeight} />
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={KEYBOARD_GAP - insets.bottom} className="flex-1">
        <ChatMessageList
          messages={chat.messages}
          dayName={day}
          headerHeight={headerHeight}
          onAdd={(message) => void chat.add(message)}
        />
        <ChatGPTAccountRow />
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
    </View>
  );
};
