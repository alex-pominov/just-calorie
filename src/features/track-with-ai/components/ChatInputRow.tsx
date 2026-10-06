import { Pressable, Text, TextInput, View } from 'react-native';

import { CameraPlusIcon, SendIcon } from '@/assets/icons';
import { LiquidGlassIconButton } from '@/components/primitives';
import { colors, spacing } from '@/modules/theme';

import type { ChatPhoto } from '../types/track-chat.types';
import { DraftPhotoPreview } from './DraftPhotoPreview';

interface ChatInputRowProps {
  draft: string;
  onChangeDraft: (text: string) => void;
  photo: ChatPhoto | null;
  onRemovePhoto: () => void;
  note: string | null;
  canSend: boolean;
  onSend: () => void;
  onAttach: () => void;
}

/** Under the row: Figma 24:4327's input section pads it 24pt, inside the home-indicator inset, as the frame draws it. */
export const INPUT_ROW_BOTTOM_PADDING = Number.parseFloat(spacing[6]);

/**
 * Frame 9:3318: camera, field, send, with the attached photo and any picker note above them, padded as Figma
 * 24:4327's input section. Send keeps the frame's light look while disabled.
 */
export const ChatInputRow = ({ draft, onChangeDraft, photo, onRemovePhoto, note, canSend, onSend, onAttach }: ChatInputRowProps) => {
  return (
    <View testID="chat-input-row" className="gap-2 px-4 pt-4" style={{ paddingBottom: INPUT_ROW_BOTTOM_PADDING }}>
      {photo === null ? null : <DraftPhotoPreview photo={photo} onRemove={onRemovePhoto} />}
      {note === null ? null : (
        <Text accessibilityRole="alert" className="font-manrope-regular text-label text-content-secondary">
          {note}
        </Text>
      )}
      <View className="flex-row items-center gap-2">
        <LiquidGlassIconButton icon={<CameraPlusIcon />} accessibilityLabel="Add a photo" onPress={onAttach} />
        <TextInput
          testID="chat-input"
          accessibilityLabel="Message"
          value={draft}
          onChangeText={onChangeDraft}
          placeholder="Type here..."
          placeholderTextColor={colors['content-faint']}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={onSend}
          className="h-12 flex-1 rounded-full bg-white-50 px-4 font-manrope-regular text-body text-primary"
        />
        <Pressable
          testID="chat-send"
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onSend}
          className="h-12 w-12 items-center justify-center rounded-full bg-surface-light"
        >
          <SendIcon />
        </Pressable>
      </View>
    </View>
  );
};
