import { isDevice } from 'expo-device';
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker';
import type { ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';

export type PhotoSource = 'camera' | 'library';

/** The picked image as the picker left it on disk, with its pixel size. */
export type PickedImage = {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
};

/** How a pick ended. Only 'picked' carries an image; 'canceled' is the user's choice and says nothing. */
export type PhotoPick =
  | { readonly status: 'picked'; readonly image: PickedImage }
  | { readonly status: 'canceled' }
  | { readonly status: 'denied' }
  | { readonly status: 'failed'; readonly source: PhotoSource };

// No base64 and no recompression here: photo-encoding.service.ts scales the image down and encodes it once.
const PICKER_OPTIONS: ImagePickerOptions = { mediaTypes: 'images', exif: false };

function toPick(result: ImagePickerResult, source: PhotoSource): PhotoPick {
  if (result.canceled) return { status: 'canceled' };

  const asset = result.assets[0];

  if (asset === undefined) return { status: 'failed', source };

  return { status: 'picked', image: { uri: asset.uri, width: asset.width, height: asset.height } };
}

async function launch(source: PhotoSource): Promise<PhotoPick> {
  if (source === 'library') return toPick(await launchImageLibraryAsync(PICKER_OPTIONS), source);

  // The camera alone asks for permission; the iOS library picker runs out of process and needs none.
  const permission = await requestCameraPermissionsAsync();

  if (!permission.granted) return { status: 'denied' };

  return toPick(await launchCameraAsync(PICKER_OPTIONS), source);
}

/**
 * Opens the camera or the library. Never throws: a refused camera, a missing camera (the simulator has
 * none) or a picker error comes back as a status the screen can show.
 */
export async function pickPhoto(source: PhotoSource): Promise<PhotoPick> {
  // MUST hold before launching the camera: on a device without one (the simulator) expo-image-picker aborts
  // the whole app natively, and no JS catch can stop it.
  if (source === 'camera' && !isDevice) return { status: 'failed', source };

  try {
    return await launch(source);
  } catch {
    // The picker's own failure (a native error) is this screen's to report, never to crash on.
    return { status: 'failed', source };
  }
}
