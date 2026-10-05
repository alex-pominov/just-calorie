import type { Ball, BallKind } from '../types/bowl.types';
import { bowlState } from './bowl-counts.service';
import {
  BOWL_CENTRE_X,
  GROUND_Y,
  INNER_RADIUS_X,
  INNER_RADIUS_Y,
  OUTER_RADIUS_X,
  OUTER_RADIUS_Y,
  RIM_CENTRE_LEFT_X,
  RIM_CENTRE_RIGHT_X,
  RIM_RADIUS,
  RIM_Y,
} from './bowl-geometry.service';
import type { BowlWorld } from './bowl-world.service';
import {
  advanceWorld,
  createWorld,
  drawnOpacity,
  drawnRadius,
  isWorldSettled,
  playFrame,
  presentCounts,
  retargetWorld,
  tintProgress,
} from './bowl-world.service';

const CAP = 1200;
const FRAME = 1 / 60;
/** Seeds that leave a red resting inside a rim when the solver records a rounding-sized contact (qa f-fea7aa). */
const SEEDS = [6, 7, 36];
/** The ground past each side of the bowl on a 402pt-wide screen. */
const SPILL = 20.5;
const LONGEST_SETTLE_FRAMES = 20 * 60;
/** Sub-pixel interpenetration is the solver converging; a ball passing through another is 16px. */
const TOLERANCE = 1;

const countsFor = (totalKcal: number, addedCarryOverKcal = 0) =>
  bowlState({ totalKcal, addedCarryOverKcal, capKcal: CAP }).counts;

const reach = (ball: Ball) => ball.radius * ball.scale - TOLERANCE;

function isInsideBowl(ball: Ball): boolean {
  const dx = ball.x - BOWL_CENTRE_X;
  const dy = ball.y - RIM_Y;

  return dy <= 0 ? Math.abs(dx) < INNER_RADIUS_X : (dx / INNER_RADIUS_X) ** 2 + (dy / INNER_RADIUS_Y) ** 2 < 1;
}

/** Every way a ball can be where it must not: in another ball, through the bowl, under the ground. */
function trespasses(world: BowlWorld): string[] {
  const found: string[] = [];

  for (const [index, a] of world.balls.entries()) {
    for (const b of world.balls.slice(index + 1)) {
      if (Math.hypot(a.x - b.x, a.y - b.y) < reach(a) + reach(b)) {
        found.push(`ball ${a.id} in ball ${b.id}`);
      }
    }

    const dx = a.x - BOWL_CENTRE_X;
    const dy = a.y - RIM_Y;
    const isInWall = dy > 0 && Math.hypot(dx / (INNER_RADIUS_X - reach(a)), dy / (INNER_RADIUS_Y - reach(a))) > 1;
    const isOutsideTrack = Math.hypot(dx / (OUTER_RADIUS_X + reach(a)), dy / (OUTER_RADIUS_Y + reach(a))) >= 1;
    const isOnRim = [RIM_CENTRE_LEFT_X, RIM_CENTRE_RIGHT_X].some((rimX) => Math.hypot(a.x - rimX, dy) < RIM_RADIUS + reach(a));

    if (a.kind !== 'overflow' && isInWall) {
      found.push(`ball ${a.id} through the bowl's inside`);
    }
    if (a.kind === 'overflow' && isInWall && !isOutsideTrack) {
      found.push(`ball ${a.id} inside the track`);
    }
    if (isOnRim || a.y + reach(a) > GROUND_Y) {
      found.push(`ball ${a.id} through a rim or the ground`);
    }
  }

  return found;
}

interface Settling {
  /** Seconds from the last drop or removal to sleep. */
  afterLastChange: number;
  /** Seconds from the change to sleep. */
  afterChange: number;
  trespasses: string[];
}

interface SettleOptions {
  /** Checks every pair after every frame, which costs. */
  isChecked?: boolean | undefined;
  isUnseen?: boolean | undefined;
}

/** Plays the world until it sleeps, checking it after every frame when asked. */
function settle(world: BowlWorld, { isChecked = false, isUnseen = false }: SettleOptions = {}): Settling {
  const seen = new Set<string>();
  let frames = 0;
  let lastChangeFrame = 0;

  while (!isWorldSettled(world) && frames < LONGEST_SETTLE_FRAMES) {
    advanceWorld(world, FRAME, { isUnseen });
    frames += 1;
    lastChangeFrame = world.changes.length > 0 ? frames : lastChangeFrame;
    if (isChecked) {
      trespasses(world).forEach((problem) => seen.add(problem));
    }
  }

  return { afterLastChange: (frames - lastChangeFrame) * FRAME, afterChange: frames * FRAME, trespasses: [...seen] };
}

function pour(world: BowlWorld, totalKcal: number, addedCarryOverKcal = 0, options: SettleOptions = {}): Settling {
  retargetWorld(world, countsFor(totalKcal, addedCarryOverKcal));

  return settle(world, options);
}

const ballsOf = (world: BowlWorld, kind: BallKind) => world.balls.filter((ball) => ball.kind === kind);
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const misplacedCount = (world: BowlWorld) =>
  ballsOf(world, 'overflow').filter(isInsideBowl).length + ballsOf(world, 'eaten').filter((ball) => !isInsideBowl(ball)).length;

/** Plays the world's displayed frames unseen, one world frame each, until one draws it; false if none did. */
function playUnseenUntilDrawn(world: BowlWorld): boolean {
  let reads = 0;
  const now = () => (reads += 1);

  for (let frame = 0; frame < LONGEST_SETTLE_FRAMES; frame += 1) {
    if (playFrame(world, { seconds: FRAME, unseen: { deadline: now() + 1, now } })) {
      return true;
    }
  }

  return false;
}

describe('the bowl world', () => {
  it.each([3, 17])('keeps every ball out of every other and inside its bounds through a whole day (seed %p)', (seed) => {
    const world = createWorld(seed);

    const seen = [0, 400, 800, 1200, 1600, 2400, 800, 0].flatMap((kcal) => pour(world, kcal, 0, { isChecked: true }).trespasses);

    expect(seen).toEqual([]);
  });

  it('holds the balls a day needs once it settles, and goes to sleep', () => {
    const world = createWorld(5);

    pour(world, 1600, 400);

    expect([presentCounts(world), isWorldSettled(world)]).toEqual([countsFor(1600, 400), true]);
  });

  it('settles within 2.5s of the last ball, under the cap and over it, whatever the seed', () => {
    const settlings = SEEDS.flatMap((seed) => {
      const world = createWorld(seed, SPILL);

      return [800, 1600, 2400].map((kcal) => pour(world, kcal).afterLastChange);
    });

    expect(Math.max(...settlings)).toBeLessThan(2.5);
  });

  it.each([
    [0, 2400],
    [1200, 1800],
    [0, 3200],
    [1600, 3200],
    [1200, 1600],
    [3200, 0],
    [2400, 1200],
  ])('drops or removes the last ball of a change from %p to %p kcal within 2.5s, whatever the seed', (from, to) => {
    const releases = SEEDS.map((seed) => {
      const world = createWorld(seed, SPILL);
      pour(world, from);
      retargetWorld(world, countsFor(to));
      const changedAt = world.time;

      while (world.changes.length > 0 && world.time - changedAt < 10) {
        advanceWorld(world, FRAME);
      }

      return world.time - changedAt;
    });

    expect(Math.max(...releases)).toBeLessThanOrEqual(2.5);
  });

  it('drops only the new balls, as a stream from above the bowl, leaving the pile where it lies', () => {
    const world = createWorld(11);
    pour(world, 400);
    const before = new Map(world.balls.map((ball) => [ball.id, ball.y]));

    retargetWorld(world, countsFor(800));
    advanceWorld(world, FRAME);
    const firstFrame = world.balls.filter((ball) => !before.has(ball.id));

    expect([...before.keys()].every((id) => world.balls.some((ball) => ball.id === id))).toBe(true);
    expect(firstFrame.length).toBeLessThanOrEqual(1);
    expect(firstFrame.every((ball) => ball.y < 0)).toBe(true);
  });

  it('never lays the balls out at fixed places: two pours of the same day settle differently', () => {
    const first = createWorld(21);
    const second = createWorld(22);

    pour(first, 800);
    pour(second, 800);
    const placesOf = (world: BowlWorld) => new Set(world.balls.map((ball) => `${Math.round(ball.x)},${Math.round(ball.y)}`));
    const shared = [...placesOf(first)].filter((place) => placesOf(second).has(place));

    expect(shared.length).toBeLessThan(5);
  });

  it('removes the highest ball first', () => {
    const world = createWorld(13);
    pour(world, 800);
    const top = ballsOf(world, 'eaten').reduce((highest, ball) => (ball.y < highest.y ? ball : highest));

    retargetWorld(world, countsFor(800 - CAP / 100));
    advanceWorld(world, FRAME);

    expect(world.balls.filter((ball) => ball.removedAt !== null).map((ball) => ball.id)).toEqual([top.id]);
  });

  it('adds a carry-over to a pile by turning its lowest balls coral and dropping the rest on top', () => {
    const world = createWorld(31);
    pour(world, 600);
    const pile = new Set(world.balls.map((ball) => ball.id));
    const lowest33 = new Set(world.balls.toSorted((a, b) => b.y - a.y).slice(0, 33).map((ball) => ball.id));

    const changedAt = world.time;
    retargetWorld(world, countsFor(1000, 400));
    const coral = ballsOf(world, 'carry-over').map(({ id, tintedAt }) => ({ id, tintedAt }));
    pour(world, 1000, 400);

    expect(coral.map(({ id }) => id).toSorted((a, b) => a - b)).toEqual([...lowest33].toSorted((a, b) => a - b));
    expect(coral.every(({ tintedAt }) => tintedAt === changedAt)).toBe(true);
    expect([...pile].every((id) => world.balls.some((ball) => ball.id === id))).toBe(true);
    expect(presentCounts(world)).toEqual(countsFor(1000, 400));
  });

  it('withdraws a carry-over from the top of the pile while the coral below turns white', () => {
    const world = createWorld(33);
    pour(world, 1000, 400);
    const lowest55 = new Set(world.balls.toSorted((a, b) => b.y - a.y).slice(0, 55).map((ball) => ball.id));

    pour(world, 600);

    expect(presentCounts(world)).toEqual(countsFor(600));
    expect(world.balls.every((ball) => lowest55.has(ball.id))).toBe(true);
  });

  it('re-colours only the boundary of the pile when the cap changes under a carry-over', () => {
    const world = createWorld(35);
    pour(world, 1000, 400);
    const time = world.time;

    retargetWorld(world, bowlState({ totalKcal: 1000, addedCarryOverKcal: 400, capKcal: 1300 }).counts);
    const retinted = world.balls.filter((ball) => ball.tintedAt === time);

    expect(retinted.map((ball) => ball.kind)).toEqual(['eaten', 'eaten']);
    expect(world.changes).toEqual([{ action: 'remove', group: 'pile', count: 6 }]);
  });

  it('fades a re-coloured ball from its old colour to its new one over 150ms', () => {
    const world = createWorld(37);
    pour(world, 600);

    retargetWorld(world, countsFor(1000, 400));
    const [ball] = ballsOf(world, 'carry-over');

    const progress = ball === undefined ? [] : [0, 0.075, 0.15].map((after) => tintProgress(ball, world.time + after));

    expect(progress.map((value) => Math.round(value * 100) / 100)).toEqual([0, 0.5, 1]);
  });

  it('takes every overflow ball before the first eaten one', () => {
    const world = createWorld(15);
    pour(world, 1600);

    retargetWorld(world, countsFor(800));
    const order: BallKind[] = [];
    while (world.changes.length > 0) {
      const removing = new Set(world.balls.filter((ball) => ball.removedAt !== null).map((ball) => ball.id));
      advanceWorld(world, FRAME);
      order.push(...world.balls.filter((ball) => ball.removedAt !== null && !removing.has(ball.id)).map((ball) => ball.kind));
    }

    expect(order).toEqual([...Array<BallKind>(33).fill('overflow'), ...Array<BallKind>(33).fill('eaten')]);
  });

  it.each([
    ['in one pour', [2400]],
    ['a step at a time', [1200, 1600, 2400]],
  ])('spills all the overflow over both rims onto the ground, %s, whatever the seed', (_path, steps) => {
    const sides = SEEDS.map((seed) => {
      const world = createWorld(seed, SPILL);
      steps.forEach((kcal) => pour(world, kcal));
      const overflow = ballsOf(world, 'overflow');

      return {
        inside: overflow.filter(isInsideBowl).length + ballsOf(world, 'eaten').filter((ball) => !isInsideBowl(ball)).length,
        left: overflow.filter((ball) => ball.x < BOWL_CENTRE_X).length,
        right: overflow.filter((ball) => ball.x > BOWL_CENTRE_X).length,
      };
    });

    expect(sides.map(({ inside }) => inside)).toEqual(SEEDS.map(() => 0));
    expect(sides.every(({ left, right }) => left > 15 && right > 15)).toBe(true);
    expect(sides.some(({ left, right }) => left !== right)).toBe(true);
  });

  it('settles an added carry-over at the bottom of the bowl, under the eaten balls', () => {
    const world = createWorld(23);

    pour(world, 1000, 400);
    const lowest = world.balls.reduce((low, ball) => (ball.y > low.y ? ball : low));

    expect(lowest.kind).toBe('carry-over');
    expect(mean(ballsOf(world, 'carry-over').map((ball) => ball.y))).toBeGreaterThan(
      mean(ballsOf(world, 'eaten').map((ball) => ball.y)) + 20,
    );
  });

  it.each([1, 2, 3])('colours the lowest balls coral once a fresh pour with a carry-over rests (seed %p)', (seed) => {
    const world = createWorld(seed);

    pour(world, 1000, 400);
    const lowestFirst = world.balls.toSorted((a, b) => b.y - a.y);

    expect(lowestFirst.slice(0, 33).map((ball) => ball.kind)).toEqual(Array<BallKind>(33).fill('carry-over'));
  });

  it.each([19, 23, 37])('keeps a rested pile in its colours: no fade starts once the world has settled (seed %p)', (seed) => {
    const world = createWorld(seed);
    pour(world, 1000, 400);
    const settledAt = world.time;

    Array.from({ length: 30 }).forEach(() => advanceWorld(world, FRAME));

    expect(world.balls.filter((ball) => ball.tintedAt !== null && ball.tintedAt > settledAt).map((ball) => ball.id)).toEqual([]);
  });

  it('plays an unseen frame within its budget, and draws the world only once it has settled', () => {
    const world = createWorld(5);
    retargetWorld(world, countsFor(600));
    let clock = 0;
    // Each read of the clock is 2ms of work, so a frame's 6ms budget buys three world frames.
    const now = () => {
      clock += 2;

      return clock;
    };
    const frames: { played: number; isDrawn: boolean }[] = [];

    while (frames.length < 300 && !isWorldSettled(world)) {
      const before = world.time;
      const isDrawn = playFrame(world, { seconds: FRAME, unseen: { deadline: now() + 6, now } });
      frames.push({ played: Math.round((world.time - before) / FRAME), isDrawn });
    }

    expect(Math.max(...frames.map(({ played }) => played))).toBe(3);
    expect(frames.map(({ isDrawn }) => isDrawn)).toEqual([...Array<boolean>(frames.length - 1).fill(false), true]);
    expect(presentCounts(world)).toEqual(countsFor(600));
  });

  it('makes a change unseen at once, at rest within 3.5s, every ball where it belongs, whatever the seed', () => {
    const results = SEEDS.map((seed) => {
      const world = createWorld(seed, SPILL);
      const { afterChange, trespasses: found } = pour(world, 2400, 0, { isChecked: true, isUnseen: true });

      return { afterChange, found, misplaced: misplacedCount(world), counts: presentCounts(world) };
    });

    expect(results.map(({ counts, misplaced, found }) => ({ counts, misplaced, found }))).toEqual(
      SEEDS.map(() => ({ counts: countsFor(2400), misplaced: 0, found: [] })),
    );
    expect(Math.max(...results.map(({ afterChange }) => afterChange))).toBeLessThan(3.5);
  });

  // Every reduce-motion change after a bowl first rests takes this path; only the rested picture is ever drawn.
  it.each([
    [0, 2400],
    [800, 2400],
  ])('makes a change unseen on a bowl that has rested, %p to %p kcal, at rest within 2.5s, every ball where it belongs, whatever the seed', (from, to) => {
    const results = SEEDS.map((seed) => {
      const world = createWorld(seed, SPILL);
      retargetWorld(world, countsFor(from));
      const hasRested = playUnseenUntilDrawn(world);

      retargetWorld(world, countsFor(to));
      const changedAt = world.time;
      const isDrawn = playUnseenUntilDrawn(world);

      return {
        settled: { hasRested, isDrawn, counts: presentCounts(world), misplaced: misplacedCount(world), found: trespasses(world) },
        afterChange: world.time - changedAt,
      };
    });

    expect(results.map(({ settled }) => settled)).toEqual(
      SEEDS.map(() => ({ hasRested: true, isDrawn: true, counts: countsFor(to), misplaced: 0, found: [] })),
    );
    expect(Math.max(...results.map(({ afterChange }) => afterChange))).toBeLessThan(2.5);
  });

  it('ends an emptied bowl with only its decorative balls, at the bottom', () => {
    const world = createWorld(25);
    pour(world, 1600);

    pour(world, 0);

    expect(world.balls.map((ball) => ball.kind)).toEqual(Array<BallKind>(5).fill('placeholder'));
    expect(world.balls.every((ball) => ball.y > RIM_Y + INNER_RADIUS_Y - 40)).toBe(true);
  });

  it('scales a new ball in from 0.7 of its size within 150ms', () => {
    const world = createWorld(27);

    retargetWorld(world, countsFor(100));
    advanceWorld(world, FRAME);
    const [ball] = world.balls;

    expect(ball === undefined ? [] : [drawnRadius(ball, ball.bornAt) / ball.radius, drawnRadius(ball, ball.bornAt + 0.15) / ball.radius]).toEqual([
      0.7, 1,
    ]);
  });

  it('removes a ball over 120 to 180ms, shrinking it towards 0.6 while it fades out', () => {
    const world = createWorld(29);
    pour(world, 100);
    retargetWorld(world, countsFor(100 - CAP / 100));
    advanceWorld(world, FRAME);
    const leaving = world.balls.find((ball) => ball.removedAt !== null);
    const seen: { scale: number; opacity: number }[] = [];

    while (leaving !== undefined && world.balls.includes(leaving)) {
      seen.push({ scale: leaving.scale, opacity: drawnOpacity(leaving, world.time) });
      advanceWorld(world, FRAME);
    }
    const last = seen.at(-1);

    expect(seen.length * FRAME).toBeGreaterThanOrEqual(0.12);
    expect(seen.length * FRAME).toBeLessThanOrEqual(0.18);
    expect(last?.scale).toBeGreaterThanOrEqual(0.6);
    expect(last?.scale).toBeLessThan(0.7);
    expect(last?.opacity).toBeLessThan(0.15);
  });
});
