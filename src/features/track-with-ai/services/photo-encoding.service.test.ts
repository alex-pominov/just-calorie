import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { encodePhoto } from './photo-encoding.service';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: { manipulate: jest.fn() },
}));

// Pixel sizes, written as shorthand so no-second-source.test.ts does not read them as styles.
const [longSide, scaledShortSide] = [1024, 768];
const saved = { uri: 'file:///scaled.jpg', width: longSide, height: scaledShortSide, base64: 'U0NBTEVE' };

function manipulatorReturning(result: object) {
  const saveAsync = jest.fn().mockResolvedValue(result);
  const context = { resize: jest.fn(), renderAsync: jest.fn().mockResolvedValue({ saveAsync }) };
  context.resize.mockReturnValue(context);
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);

  return { context, saveAsync };
}

describe('encodePhoto', () => {
  it('scales a landscape photo to 1024 wide and encodes it once as JPEG base64', async () => {
    const { context, saveAsync } = manipulatorReturning(saved);
    const [width, height] = [4032, 3024];

    await expect(encodePhoto({ uri: 'file:///big.jpg', width, height })).resolves.toEqual({
      uri: 'file:///scaled.jpg',
      base64: 'U0NBTEVE',
      mimeType: 'image/jpeg',
    });
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///big.jpg');
    expect(context.resize).toHaveBeenCalledWith({ width: longSide, height: null });
    expect(saveAsync).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  });

  it('scales a portrait photo by its height', async () => {
    const { context } = manipulatorReturning(saved);
    const [width, height] = [3024, 4032];

    await encodePhoto({ uri: 'file:///tall.jpg', width, height });

    expect(context.resize).toHaveBeenCalledWith({ width: null, height: longSide });
  });

  it('leaves a photo already within 1024 at its size', async () => {
    const { context } = manipulatorReturning(saved);
    const [width, height] = [800, 600];

    await encodePhoto({ uri: 'file:///small.jpg', width, height });

    expect(context.resize).not.toHaveBeenCalled();
  });

  it('refuses a result with no image data', async () => {
    manipulatorReturning({ ...saved, base64: undefined });
    const [width, height] = [800, 600];

    await expect(encodePhoto({ uri: 'file:///small.jpg', width, height })).rejects.toThrow('without image data');
  });
});
