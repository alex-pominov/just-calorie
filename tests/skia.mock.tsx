// Jest's stand-in for @shopify/react-native-skia, mapped in jest.config.js. The real package needs its native
// module (or CanvasKit under its own node environment), which jest-expo's environment has neither of. Only what
// the app imports is here: a canvas that draws nothing, and the Skia factories the bowl calls at module load.
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';

interface CanvasProps {
  children?: ReactNode;
}

let canvasesMounted = 0;

/** Each canvas carries the order it was mounted in as its nativeID, so a test can tell a fresh one from a re-render. */
export const Canvas = (_props: CanvasProps) => {
  const [mount] = useState(() => (canvasesMounted += 1));

  return <View testID="skia-canvas" nativeID={`skia-canvas-${mount}`} />;
};
export const Group = () => null;
export const Path = () => null;
export const Picture = () => null;

const noop = () => undefined;

export const Skia = {
  Color: () => new Float32Array([1, 1, 1, 1]),
  Paint: () => ({ setColor: noop, setAlphaf: noop }),
  Path: { MakeFromSVGString: () => ({}) },
};

export const createPicture = (draw: (canvas: { drawCircle: () => void }) => void) => {
  draw({ drawCircle: noop });

  return {};
};
