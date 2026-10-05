import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { ChatPhoto } from '../types/track-chat.types';
import type { PickedImage } from './photo-picker.service';

// The estimate reads a photo at detail 'low', a 512px rendition; 1024 on the long side keeps the upload
// small with room to spare. A full-size phone photo is megabytes and can outlast the request timeout.
const LONG_SIDE_PX = 1024;
const JPEG_QUALITY = 0.7;
const PHOTO_MIME_TYPE = 'image/jpeg';

// The manipulator scales the other side to keep the ratio when one side is null.
function fitLongSide({ width, height }: PickedImage, longSide: number) {
  return width >= height ? { width: longSide, height: null } : { width: null, height: longSide };
}

/** Scales a picked image down to the long side the estimate needs, then encodes it once as JPEG base64. */
export async function encodePhoto(image: PickedImage): Promise<ChatPhoto> {
  const context = ImageManipulator.manipulate(image.uri);

  if (Math.max(image.width, image.height) > LONG_SIDE_PX) context.resize(fitLongSide(image, LONG_SIDE_PX));

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });

  if (saved.base64 === undefined || saved.base64 === '') throw new Error('The scaled photo came back without image data');

  return { uri: saved.uri, base64: saved.base64, mimeType: PHOTO_MIME_TYPE };
}
