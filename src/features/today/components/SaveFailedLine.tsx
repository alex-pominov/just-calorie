import { Text } from 'react-native';

// Shown under a pop-up's amount when its store failed; the sheet stays open so the person can try again.
export const SaveFailedLine = () => (
  <Text accessibilityLiveRegion="polite" className="mt-2 text-center font-manrope-medium text-label text-coral">
    {"Couldn't save. Try again."}
  </Text>
);
