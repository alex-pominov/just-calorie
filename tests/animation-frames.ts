// Reanimated's frame loop asks globalThis.requestAnimationFrame for every frame. Under Jest, react-native-worklets
// answers on a 0ms timer, which fake timers fire 1ms apart, so a second of play costs 1000 frame callbacks. A phone
// gives 60: this makes the loop's frames arrive 1/60s apart, the same physics in a sixteenth of the callbacks.
const FRAME_MS = 1000 / 60;

/** Paces animation frames at 60 a second of fake time; the returned function puts the platform's pacing back. */
export function installSixtyHertzFrames(): () => void {
  const platform = globalThis.requestAnimationFrame;
  let frameId = 0;

  globalThis.requestAnimationFrame = (callback) => {
    setTimeout(() => callback(performance.now()), FRAME_MS);
    frameId += 1;

    return frameId;
  };

  return () => {
    globalThis.requestAnimationFrame = platform;
  };
}
