import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

import { blurIntensity, gradients } from '@/modules/theme';

const HEADER_FADE = [
  {
    type: 'linear-gradient',
    direction: 'to bottom',
    colorStops: gradients['header-fade'].map(({ color, position }) => ({ color, positions: [position] })),
  },
] as const;

/** The header's backdrop: content under it is blurred, then Ink/900 fades from opaque to clear at its bottom edge. */
export const CalendarHeaderBackdrop = () => (
  <>
    <BlurView intensity={blurIntensity.header} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: HEADER_FADE }]} />
  </>
);
