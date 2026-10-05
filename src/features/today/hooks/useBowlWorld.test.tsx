import { act, render } from '@testing-library/react-native';
import type { SharedValue } from 'react-native-reanimated';

import { installSixtyHertzFrames } from '@tests/animation-frames';

import { bowlState } from '../services/bowl-counts.service';
import type { BowlPicture } from '../services/bowl-world.service';
import { presentCounts } from '../services/bowl-world.service';
import type { BowlCounts } from '../types/bowl.types';
import { useBowlWorld } from './useBowlWorld';

// A few balls each: the hook's contract is when its loop runs, and the physics is proven in bowl-world.service.test.
const countsFor = (totalKcal: number) => bowlState({ totalKcal, addedCarryOverKcal: 0, capKcal: 1200 }).counts;

interface ProbeProps {
  counts: BowlCounts;
  onPicture: (picture: SharedValue<BowlPicture>) => void;
}

const Probe = ({ counts, onPicture }: ProbeProps) => {
  onPicture(useBowlWorld(counts, 0));

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

describe('useBowlWorld', () => {
  let restoreFrames: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    restoreFrames = installSixtyHertzFrames();
  });

  afterEach(() => {
    restoreFrames();
    jest.useRealTimers();
  });

  it('plays the world to the counts it is given, then stops its frame loop', async () => {
    const bowl = await renderBowl(countsFor(100));

    await play(3);
    const stoppedAt = bowl.picture().time;
    await play(1);

    expect(presentCounts(bowl.picture())).toEqual(countsFor(100));
    expect(bowl.picture().time).toBe(stoppedAt);
  });

  it('starts the loop again when the counts change after it stopped', async () => {
    const bowl = await renderBowl(countsFor(100));
    await play(3);
    const stoppedAt = bowl.picture().time;

    await bowl.rerender(countsFor(200));
    await play(3);

    expect(bowl.picture().time).toBeGreaterThan(stoppedAt);
    expect(presentCounts(bowl.picture())).toEqual(countsFor(200));
  });

  it('ends on the last of several changes made at once, never on a stale one', async () => {
    const bowl = await renderBowl(countsFor(100));

    await bowl.rerender(countsFor(400));
    await bowl.rerender(countsFor(50));
    await bowl.rerender(countsFor(200));
    await play(4);

    expect(presentCounts(bowl.picture())).toEqual(countsFor(200));
  });
});
