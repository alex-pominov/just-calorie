import {
  PermissionStatus,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';

import { pickPhoto } from './photo-picker.service';

const mockDevice = { isDevice: true };

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));

jest.mock('expo-image-picker', () => ({
  PermissionStatus: jest.requireActual('expo-image-picker').PermissionStatus,
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

const granted = { granted: true, status: PermissionStatus.GRANTED, canAskAgain: true, expires: 'never' } as const;
const denied = { granted: false, status: PermissionStatus.DENIED, canAskAgain: false, expires: 'never' } as const;
// A picked photo's pixel size, which encodePhoto reads to scale it down.
const [width, height] = [4032, 3024];
const asset = { uri: 'file:///photo.jpg', width, height, mimeType: 'image/heic' };

describe('pickPhoto', () => {
  beforeEach(() => {
    mockDevice.isDevice = true;
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [asset] });
    jest.mocked(launchCameraAsync).mockResolvedValue({ canceled: false, assets: [asset] });
  });

  it('returns a library pick as its file and pixel size, asking the picker for no base64', async () => {
    await expect(pickPhoto('library')).resolves.toEqual({ status: 'picked', image: { uri: 'file:///photo.jpg', width, height } });
    expect(launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: 'images', exif: false });
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });

  it('asks for camera permission, then opens the camera, for a camera pick', async () => {
    await expect(pickPhoto('camera')).resolves.toMatchObject({ status: 'picked' });
    expect(requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(launchCameraAsync).toHaveBeenCalled();
    expect(requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports a cancel as canceled', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });

    await expect(pickPhoto('library')).resolves.toEqual({ status: 'canceled' });
  });

  it('reports a refused camera permission without opening the camera', async () => {
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue(denied);

    await expect(pickPhoto('camera')).resolves.toEqual({ status: 'denied' });
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });

  it('never launches the camera on a device without one (the simulator), where the picker would abort the app', async () => {
    mockDevice.isDevice = false;

    await expect(pickPhoto('camera')).resolves.toEqual({ status: 'failed', source: 'camera' });
    expect(requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });

  it('still opens the library on a device without a camera', async () => {
    mockDevice.isDevice = false;

    await expect(pickPhoto('library')).resolves.toMatchObject({ status: 'picked' });
  });

  it('reports a picker that fails to open as failed', async () => {
    jest.mocked(launchCameraAsync).mockRejectedValue(new Error('Camera failed'));

    await expect(pickPhoto('camera')).resolves.toEqual({ status: 'failed', source: 'camera' });
  });

  it('reports a pick that came back with no asset as failed', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [] });

    await expect(pickPhoto('library')).resolves.toEqual({ status: 'failed', source: 'library' });
  });
});
