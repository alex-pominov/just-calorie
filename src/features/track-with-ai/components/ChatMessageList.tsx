import { useRef } from 'react';
import { FlatList } from 'react-native';

import type { AiMessage as AiMessageModel, ChatMessage } from '../types/track-chat.types';
import { AiMessage } from './AiMessage';
import { UserMessageBubble } from './UserMessageBubble';

interface ChatMessageListProps {
  messages: readonly ChatMessage[];
  /** The day Add writes to, as the chat names it. */
  dayName: string;
  headerHeight: number;
  onAdd: (message: AiMessageModel) => void;
  onOpenUsageSettings: () => void;
}

/**
 * Oldest first, under the header, and kept scrolled to the newest message whenever the content grows or the
 * viewport shrinks (the keyboard opening). The offset comes from the two native measurements: FlatList's own
 * scrollToEnd reads cell metrics that are stale when the content changes, and stops short.
 */
export const ChatMessageList = ({ messages, dayName, headerHeight, onAdd, onOpenUsageSettings }: ChatMessageListProps) => {
  const list = useRef<FlatList<ChatMessage>>(null);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);

  const showNewest = () =>
    list.current?.scrollToOffset({ offset: Math.max(0, contentHeight.current - viewportHeight.current), animated: true });

  return (
    <FlatList
      ref={list}
      testID="chat-messages"
      data={messages}
      keyExtractor={(message) => message.id}
      renderItem={({ item }) =>
        item.role === 'user' ? (
          <UserMessageBubble message={item} />
        ) : (
          <AiMessage message={item} dayName={dayName} onAdd={onAdd} onOpenUsageSettings={onOpenUsageSettings} />
        )
      }
      className="flex-1"
      contentContainerClassName="gap-10 px-4 pb-4"
      contentContainerStyle={{ paddingTop: headerHeight }}
      scrollIndicatorInsets={{ top: headerHeight }}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onLayout={(event) => {
        viewportHeight.current = event.nativeEvent.layout.height;
        showNewest();
      }}
      onContentSizeChange={(_width, height) => {
        contentHeight.current = height;
        showNewest();
      }}
    />
  );
};
