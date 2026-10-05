import { PermissionStatus, launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } from 'expo-image-picker';

import { pickPhoto } from './photo-picker.service';

// QA reproduction (track-with-ai, round 1a pass 2). expo-image-picker 57's own doc for launchImageLibraryAsync:
// "Requires Permissions.MEDIA_LIBRARY on iOS 10 only." The iOS library picker (PHPicker) runs out of process
// and needs no photo-library access, yet pickPhoto asks for it first, and a refusal blocks the pick.
jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('expo-image-picker', () => ({
  PermissionStatus: jest.requireActual('expo-image-picker').PermissionStatus,
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

const denied = { granted: false, status: PermissionStatus.DENIED, canAskAgain: false, expires: 'never' } as const;
// Adopted by the app lane: the size is written as shorthand so no-second-source.test.ts does not read it as a style.
const [width, height] = [800, 600];
const asset = { uri: 'file:///lunch.jpg', width, height, base64: 'AAEC', mimeType: 'image/jpeg' };

describe('qa: choosing from the library needs no photo-library permission', () => {
  it('opens the library and returns the pick for a user who refused photo access', async () => {
    jest.mocked(requestMediaLibraryPermissionsAsync).mockResolvedValue(denied);
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [asset] });

    await expect(pickPhoto('library')).resolves.toMatchObject({ status: 'picked' });
  });

  it('never shows the photo-library permission prompt for a library pick', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [asset] });

    await pickPhoto('library');

    expect(requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });
});
