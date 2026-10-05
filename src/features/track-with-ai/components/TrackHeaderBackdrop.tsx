import { StyleSheet, View } from 'react-native';

import { gradients } from '@/modules/theme';

const HEADER_FADE = [
  {
    type: 'linear-gradient',
    direction: 'to bottom',
    colorStops: gradients['header-fade'].map(({ color, position }) => ({ color, positions: [position] })),
  },
] as const;

/** Frame 9:3378's fill and nothing else: Ink/900 fading to clear, so the chat under it dims rather than blurs. */
export const TrackHeaderBackdrop = () => (
  <View testID="track-header-fade" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: HEADER_FADE }]} />
);
