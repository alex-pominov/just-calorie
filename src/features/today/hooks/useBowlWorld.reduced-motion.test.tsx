import { act, render } from '@testing-library/react-native';
import type { SharedValue } from 'react-native-reanimated';

import { installSixtyHertzFrames } from '@tests/animation-frames';

import { bowlState } from '../services/bowl-counts.service';
import type { BowlPicture } from '../services/bowl-world.service';
import { presentCounts } from '../services/bowl-world.service';
import type { BowlCounts } from '../types/bowl.types';
import { useBowlWorld } from './useBowlWorld';

// The system's reduce-motion setting is the platform's: Reanimated reads it, so the test sets it there.
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<object>('react-native-reanimated'),
  useReducedMotion: () => true,
}));

const countsFor = (totalKcal: number) => bowlState({ totalKcal, addedCarryOverKcal: 0, capKcal: 1200 }).counts;

interface ProbeProps {
  counts: BowlCounts;
  onPicture: (picture: SharedValue<BowlPicture>) => void;
}

const Probe = ({ counts, onPicture }: ProbeProps) => {
  onPicture(useBowlWorld(counts, 20.5));

  return null;
};

async function renderBowl(counts: BowlCounts) {
  let picture: SharedValue<BowlPicture> | null = null;
  const onPicture = (shared: SharedValue<BowlPicture>) => {
    picture = shared;
  };
  const view = await render(<Probe counts={counts} onPicture={onPicture} />);

  return {
    rerender: (next: BowlCounts) => view.rerender(<Probe counts={next} onPicture={onPicture} />),
    picture: () => {
      if (picture === null) {
        throw new Error('the probe never rendered');
      }

      return picture.value;
    },
  };
}

const play = (seconds: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(seconds * 1000);
  });

describe('useBowlWorld with reduce motion on', () => {
  let restoreFrames: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    restoreFrames = installSixtyHertzFrames();
  });

  afterEach(() => {
    restoreFrames();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('settles a change out of sight, then stops its frame loop', async () => {
    const bowl = await renderBowl(countsFor(100));
    await play(0.5);

    await bowl.rerender(countsFor(200));
    await play(0.5);
    const stoppedAt = bowl.picture().time;
    await play(0.5);

    expect(presentCounts(bowl.picture())).toEqual(countsFor(200));
    expect(bowl.picture().time).toBe(stoppedAt);
  });

  it('shows a freshly mounted bowl, as on a day switch, only once it has settled out of sight', async () => {
    makeClockCostly();
    const bowl = await renderBowl(countsFor(400));

    const afterOneFrame = await picturesShownOver(bowl, 1);
    const shown = await picturesShownOver(bowl, 120);

    expect(afterOneFrame).toEqual([]);
    expect(shown).toHaveLength(1);
    expect(presentCounts(bowl.picture())).toEqual(countsFor(400));
  });

  it('changes a shown bowl straight to its next settled picture, never through the ones in between', async () => {
    makeClockCostly();
    const bowl = await renderBowl(countsFor(200));
    await picturesShownOver(bowl, 60);
    const restingBefore = describePicture(bowl.picture());

    await bowl.rerender(countsFor(400));
    const afterOneFrame = await picturesShownOver(bowl, 1);
    const shown = await picturesShownOver(bowl, 120);

    expect(afterOneFrame).toEqual([restingBefore]);
    expect(shown).toEqual([restingBefore, describePicture(bowl.picture())]);
    expect(presentCounts(bowl.picture())).toEqual(countsFor(400));
  });
});

/** Each read of the clock is 2ms of work, so a frame's budget runs out before the world settles, as on a phone. */
function makeClockCostly() {
  let clock = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => (clock += 2));
}

const describePicture = (picture: BowlPicture) =>
  picture.balls.map((ball) => `${ball.kind}@${ball.x.toFixed(1)},${ball.y.toFixed(1)}`).join(' ');

/** Plays `frames` frames and lists each different non-empty picture the bowl showed, in order, from the one shown now. */
async function picturesShownOver(bowl: Awaited<ReturnType<typeof renderBowl>>, frames: number) {
  const shown = [describePicture(bowl.picture())].filter((picture) => picture !== '');

  for (let frame = 0; frame < frames; frame += 1) {
    await play(1 / 60);
    const picture = describePicture(bowl.picture());
    if (picture !== '' && picture !== shown.at(-1)) {
      shown.push(picture);
    }
  }

  return shown;
}
