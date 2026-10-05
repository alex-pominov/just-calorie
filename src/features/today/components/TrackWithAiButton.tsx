import { Pressable, Text } from 'react-native';

import { StarsIcon } from '@/assets/icons';

interface TrackWithAiButtonProps {
  onPress: () => void;
}

// Figma 5:1807.
export const TrackWithAiButton = ({ onPress }: TrackWithAiButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Track with AI"
    onPress={onPress}
    className="flex-row items-center justify-center gap-2 self-center rounded-full bg-primary px-6 py-4"
  >
    <Text className="font-manrope-bold text-body-tight text-ink-900">Track with AI</Text>
    <StarsIcon />
  </Pressable>
);
