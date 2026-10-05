import { ActionSheetIOS } from 'react-native';

import type { PhotoSource } from './photo-picker.service';

const OPTIONS: readonly { label: string; source: PhotoSource | null }[] = [
  { label: 'Take photo', source: 'camera' },
  { label: 'Choose from library', source: 'library' },
  { label: 'Cancel', source: null },
];

/** The native choice behind the camera button. Resolves to null when the user cancels. */
export function choosePhotoSource(): Promise<PhotoSource | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: OPTIONS.map(({ label }) => label), cancelButtonIndex: OPTIONS.length - 1 },
      (index) => resolve(OPTIONS[index]?.source ?? null),
    );
  });
}
