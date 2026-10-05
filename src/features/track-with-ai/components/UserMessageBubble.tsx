import { Image, Text, View } from 'react-native';

import type { UserMessage } from '../types/track-chat.types';

interface UserMessageBubbleProps {
  message: UserMessage;
}

/** Right-aligned: the text bubble (frame 9:3387), with a sent photo under it (9:3395). */
export const UserMessageBubble = ({ message }: UserMessageBubbleProps) => (
  <View testID={`user-message-${message.id}`} className="max-w-65 items-end gap-3 self-end">
    {message.text === null ? null : (
      <View className="rounded-t-xl rounded-bl-xl rounded-br-sm bg-white-50 px-4 py-3">
        <Text className="font-manrope-regular text-body text-primary">{message.text}</Text>
      </View>
    )}
    {message.photo === null ? null : (
      <Image
        testID={`user-photo-${message.id}`}
        accessibilityLabel="Sent photo"
        source={{ uri: message.photo.uri }}
        resizeMode="cover"
        className="h-50 w-40 rounded-xl border border-white-100"
      />
    )}
  </View>
);
