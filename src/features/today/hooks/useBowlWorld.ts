import { useCallback, useEffect, useRef, useState } from 'react';
import type { FrameInfo, SharedValue } from 'react-native-reanimated';
import { useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { BowlPicture } from '../services/bowl-world.service';
import { createWorld, isWorldSettled, playFrame, restingPicture, retargetWorld } from '../services/bowl-world.service';
import type { BowlCounts } from '../types/bowl.types';

interface BowlTarget {
  counts: BowlCounts;
  /** Bumped on every change, so a world that settled on an older target never stops the newer one. */
  version: number;
}

const FRAME_SECONDS = 1 / 60;
/** With reduce motion on, each frame plays the world unseen for at most this many ms of the UI thread (at least one world frame). */
const UNSEEN_BUDGET_MS = 6;
/** A world that has never rested (a day switch) shows nothing until it does, so it gets more of each frame. */
const FIRST_UNSEEN_BUDGET_MS = 24;
const NOTHING_SHOWN: BowlPicture = { balls: [], time: 0 };

function readClock(): number {
  'worklet';
  return Date.now();
}

/**
 * Runs the bowl's world, its ground `spill` px wider than the bowl each side, on the UI thread, a frame at a time,
 * towards `counts`, and returns what the bowl draws. The frame loop stops once the world settles and starts again when
 * `counts` changes. With reduce motion on, the world settles by physics out of sight, its changes made at once rather
 * than streamed, and the picture is a copy of it at rest: the pile appears in its new state without moving.
 */
export function useBowlWorld(counts: BowlCounts, spill: number): SharedValue<BowlPicture> {
  const [seed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const [settledVersion, setSettledVersion] = useState(-1);
  const world = useSharedValue(createWorld(seed, spill));
  const shown = useSharedValue(NOTHING_SHOWN);
  const target = useSharedValue<BowlTarget>({ counts, version: -1 });
  const appliedVersion = useSharedValue(-1);
  const latestVersion = useRef(-1);
  const isReducedMotion = useReducedMotion();

  // A stable identity is required: useFrameCallback registers a new loop whenever its callback changes.
  const onFrame = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      const current = world.value;
      const { counts: wanted, version } = target.value;

      if (appliedVersion.value !== version) {
        retargetWorld(current, wanted);
        appliedVersion.set(version);
      }
      const budget = current.hasRested ? UNSEEN_BUDGET_MS : FIRST_UNSEEN_BUDGET_MS;
      const isDrawn = playFrame(current, {
        seconds: (frame.timeSincePreviousFrame ?? 1000 * FRAME_SECONDS) / 1000,
        unseen: isReducedMotion ? { deadline: readClock() + budget, now: readClock } : undefined,
      });

      if (isDrawn && isReducedMotion) {
        shown.set(restingPicture(current));
      } else if (isDrawn && shown.value === current) {
        shown.modify();
      } else if (isDrawn) {
        shown.set(current);
      }
      if (isWorldSettled(current)) {
        scheduleOnRN(setSettledVersion, version);
      }
    },
    [appliedVersion, isReducedMotion, shown, target, world],
  );
  const frameLoop = useFrameCallback(onFrame, false);
  const { placeholder, eaten, overflow } = counts;
  const carryOver = counts['carry-over'];

  useEffect(() => {
    latestVersion.current += 1;
    target.set({ counts: { placeholder, 'carry-over': carryOver, eaten, overflow }, version: latestVersion.current });
    frameLoop.setActive(true);
  }, [placeholder, carryOver, eaten, overflow, frameLoop, target]);

  useEffect(() => {
    if (settledVersion === latestVersion.current) {
      frameLoop.setActive(false);
    }
  }, [settledVersion, frameLoop]);

  return shown;
}
