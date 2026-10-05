import { Image, Pressable, View } from 'react-native';

import { CloseIcon } from '@/assets/icons';

import type { ChatPhoto } from '../types/track-chat.types';

interface DraftPhotoPreviewProps {
  photo: ChatPhoto;
  onRemove: () => void;
}

/** Undrawn in frame 9:3192: the attached photo waits above the input row, removable, until it is sent. */
export const DraftPhotoPreview = ({ photo, onRemove }: DraftPhotoPreviewProps) => (
  <View testID="draft-photo" className="self-start">
    <Image
      accessibilityLabel="Attached photo"
      source={{ uri: photo.uri }}
      resizeMode="cover"
      className="h-14 w-14 rounded-lg border border-white-100"
    />
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Remove photo"
      onPress={onRemove}
      hitSlop={8}
      className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-ink-900"
    >
      <CloseIcon size={16} />
    </Pressable>
  </View>
);
