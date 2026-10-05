import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloseIcon } from '@/assets/icons';
import { LiquidGlassIconButton } from '@/components/primitives';

import { TrackHeaderBackdrop } from './TrackHeaderBackdrop';

interface TrackHeaderProps {
  onClose: () => void;
  onHeightChange: (height: number) => void;
}

/** Sits over the chat from the screen's top edge, so it pads itself below the status bar. */
export const TrackHeader = ({ onClose, onHeightChange }: TrackHeaderProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="track-header"
      className="absolute left-0 right-0 top-0 z-10"
      style={{ paddingTop: insets.top }}
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
    >
      <TrackHeaderBackdrop />
      <View className="flex-row items-center gap-2 px-4 pb-6">
        <View className="h-12 w-12" />
        <Text accessibilityRole="header" className="flex-1 text-center font-manrope-bold text-title text-primary">
          Track with AI
        </Text>
        <LiquidGlassIconButton icon={<CloseIcon />} accessibilityLabel="Close" onPress={onClose} />
      </View>
    </View>
  );
};
