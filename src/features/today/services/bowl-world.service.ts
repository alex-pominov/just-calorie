import type { Ball, BallGroup, BallKind, BowlChange, BowlCounts } from '../types/bowl.types';
import {
  BOWL_CENTRE_X,
  BOWL_HEADROOM,
  BOWL_WIDTH,
  GROUND_Y,
  INNER_RADIUS_X,
  INNER_RADIUS_Y,
  OUTER_RADIUS_X,
  OUTER_RADIUS_Y,
  RIM_CENTRE_RIGHT_X,
  RIM_Y,
} from './bowl-geometry.service';
import type { Contacts, Ground } from './bowl-physics.service';
import { AVERAGE_BALL_RADIUS, createContacts, MAX_BALL_RADIUS, stepPhysics, SUBSTEP } from './bowl-physics.service';
import { planBowlChanges } from './bowl-plan.service';

// The bowl's world: its balls, the changes still to make to them, and the clock that paces both. It is an entity
// that lives on the UI thread and changes only through the functions below, which are worklets for that reason.

/** Each ball is 0.9x to 1.1x of the average, 16px across. */
const RADIUS_SPREAD = 0.1;
/** Seconds between drops: 0 to 800 kcal pours in over 1.3s. A faster pour sloshes up the walls. */
const DROP_GAP = 0.02;
/** Overflow sheds slower, and only into clear air: two balls arcing off one rim knock each other back into the bowl. */
const SHED_GAP = 0.04;
const SHED_CLEARANCE = 6;
/**
 * A change that overflows finishes dropping within about 2.5s (Manager decision (a), f-e8f6dd): its pile pours within
 * this long, and an overflow of more than VOLLEY_FROM balls sheds in volleys over both rims, starting once the pile
 * has VOLLEY_OVERLAP of its balls left to drop. The measurements are in the feature README.
 */
const PILE_RUSH_SECONDS = 0.6;
const RUSH_SPAWN_TRIES = 16;
const VOLLEY_FROM = 16;
const VOLLEY_MAX = 3;
const VOLLEY_GAP = 1 / 60;
const VOLLEY_OVERLAP = 0.6;
/** A volley's balls share one throw, so none knocks another back in flight, thrown harder to clear the rim sooner. */
const VOLLEY_THROW = 1.5;
/** A volley's balls, in ball widths from the shed spot: there, one above it, one outward. */
const VOLLEY_SHAPE = [
  { out: 0, up: 0 },
  { out: 0, up: 1 },
  { out: 1, up: 0 },
] as const;
const VOLLEY_SPACING = 2 * MAX_BALL_RADIUS + 1;
/** Once the two overflow piles differ by this many, the lighter one's rim sheds alone, so they end within 3 of each other. */
const VOLLEY_LEAN = 2;
const REMOVE_STREAM_SECONDS = 0.9;
const REMOVE_GAP = { min: 0.008, max: 0.04 };
/** A frame longer than this (a stall, the app in the background) advances the world by this much only. */
const LONGEST_FRAME = 1 / 30;
const ACTIONS_PER_FRAME = 3;
/** Spots tried for a new ball before its drop waits a frame: a ball never appears on top of another. */
const SPAWN_TRIES = 4;
const SPAWN_Y = -BOWL_HEADROOM + MAX_BALL_RADIUS + 2;
/** New balls fall from within ±40% of the bowl's inner width about its centre. */
const SPAWN_SPREAD = 0.4 * 2 * INNER_RADIUS_X;
/**
 * The full pile sheds its overflow: each ball starts just above the pile's edge, 4 to 12px inside a rim's crown, and
 * arcs out over it (Manager ruling on request [0]). Dropped onto the pile, a ball can catch against a rim and stay
 * inside the bowl.
 */
const SHED_REACH = { min: RIM_CENTRE_RIGHT_X - BOWL_CENTRE_X - 12, max: RIM_CENTRE_RIGHT_X - BOWL_CENTRE_X - 4 };
const SHED_Y = RIM_Y - 26;
/** px/s, outward and upward: from the farthest start, slower than this lands on the crown's inner side. */
const SHED_SPEED = { out: { min: 120, max: 170 }, up: { min: 60, max: 110 } };
/** The chance the next overflow ball sheds over the other rim: mostly alternating, never quite symmetrical. */
const SWITCH_SIDE = 0.7;
/** Unseen, a pile ball with no room drops from one ball higher, so a change falls in as one column, not a stream. */
const COLUMN_STEP = 2 * MAX_BALL_RADIUS + 2;
/** Unseen, a world that has never rested (a day switch) places its pile bottom up inside the bowl, from this height. */
const FLOOR_COLUMN_Y = RIM_Y + INNER_RADIUS_Y - MAX_BALL_RADIUS - 1;
const UNSEEN_TRIES = 40;
/** The world sleeps once no ball has moved faster than this (px/s) for SLEEP_AFTER seconds. */
const SLEEP_SPEED = 10;
const SLEEP_AFTER = 0.25;

export const APPEAR_SECONDS = 0.12;
export const REMOVE_SECONDS = 0.15;
const TINT_SECONDS = 0.15;
/** Unseen, the world plays in frames of this length, as many as a displayed frame's budget allows. */
const UNSEEN_FRAME_SECONDS = 1 / 60;

export interface BowlWorld {
  balls: Ball[];
  contacts: Contacts;
  /** Changes still to make, in order; the first is under way. */
  changes: BowlChange[];
  /** The ground's ends, wider than the bowl's frame where the screen is: overflow piles up between them. */
  ground: Ground;
  /** Seconds between the steps of the change under way. */
  stepGap: number;
  nextStepAt: number;
  /** Seconds between pile drops in the current changes: DROP_GAP, or less when they overflow. */
  pileGap: number;
  /** Balls in the leading rim's volley for the current overflow; 1 sheds single balls. */
  volley: number;
  /** Pile drops left when the overflow's volleys start, and when the next volley is due while the pile still pours. */
  volleyFrom: number;
  nextVolleyAt: number;
  /** Unseen, the height the next pile ball drops from: the top of the column the change is falling in as. */
  columnY: number;
  time: number;
  /** Simulated time not yet spent on a whole substep. */
  unspent: number;
  calmFor: number;
  /** Whether the pile's colours were taken again since the last change came to rest: once, so a rested pile keeps them. */
  isRestRetinted: boolean;
  /** Whether the world has come to rest since it was created; unseen, only a world that has can be shown. */
  hasRested: boolean;
  randomState: number;
  nextId: number;
  nextSide: -1 | 1;
}

/** What the bowl draws: its balls, and the clock their scale, fade and colour changes run on. */
export interface BowlPicture {
  balls: readonly Ball[];
  time: number;
}

/** A copy of the world as it rests, for a picture nothing that moves later can reach. */
export function restingPicture(world: BowlWorld): BowlPicture {
  'worklet';
  return { balls: world.balls.map((ball) => ({ ...ball })), time: world.time };
}

/**
 * An empty world, its ground reaching `spill` px past the bowl's frame on each side. Its randomness comes from
 * `seed` alone, so a seed replays the same pour.
 */
export function createWorld(seed: number, spill = 0): BowlWorld {
  'worklet';
  return {
    balls: [],
    contacts: createContacts(),
    ground: { minX: -spill, maxX: BOWL_WIDTH + spill },
    changes: [],
    stepGap: 0,
    nextStepAt: 0,
    pileGap: DROP_GAP,
    volley: 1,
    volleyFrom: 0,
    nextVolleyAt: 0,
    columnY: SPAWN_Y,
    time: 0,
    unspent: 0,
    calmFor: 0,
    isRestRetinted: true,
    hasRested: false,
    randomState: seed | 0,
    nextId: 0,
    nextSide: seed % 2 === 0 ? -1 : 1,
  };
}

/** mulberry32: a uniform number in [0, 1) from the world's own state. */
function nextRandom(world: BowlWorld): number {
  'worklet';
  world.randomState = (world.randomState + 0x6d2b79f5) | 0;
  let mixed = world.randomState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

/** The balls the world holds now, by kind, not counting any on their way out. */
export function presentCounts(world: BowlPicture): BowlCounts {
  'worklet';
  const counts = { placeholder: 0, 'carry-over': 0, eaten: 0, overflow: 0 };

  for (const ball of world.balls) {
    if (ball.removedAt === null) {
      counts[ball.kind] += 1;
    }
  }

  return counts;
}

function gapFor(world: BowlWorld, change: BowlChange | undefined): number {
  'worklet';
  if (change === undefined) {
    return 0;
  }

  if (change.action === 'drop' && change.kind === 'overflow') {
    return world.volley > 1 ? VOLLEY_GAP : SHED_GAP;
  }
  if (change.action === 'drop') {
    return change.kind === 'placeholder' ? DROP_GAP : world.pileGap;
  }

  return Math.min(REMOVE_GAP.max, Math.max(REMOVE_GAP.min, REMOVE_STREAM_SECONDS / change.count));
}

const isInPileKind = (kind: BallKind) => {
  'worklet';
  return kind === 'carry-over' || kind === 'eaten';
};

const isInPile = (ball: Ball) => {
  'worklet';
  return isInPileKind(ball.kind);
};

/**
 * Colours the pile by height, not by identity (Manager ruling on request [1]): of the balls that stay, the lowest
 * `target['carry-over']` are coral and the rest white. The highest, which are about to leave, keep their colour.
 * True when a ball changed colour.
 */
function retintPile(world: BowlWorld, target: BowlCounts): boolean {
  'worklet';
  const lowestFirst = world.balls.filter((ball) => isInPile(ball) && ball.removedAt === null).sort((a, b) => b.y - a.y);
  const staying = Math.min(lowestFirst.length, target['carry-over'] + target.eaten);
  let isRetinted = false;

  lowestFirst.slice(0, staying).forEach((ball, index) => {
    const kind = index < target['carry-over'] ? 'carry-over' : 'eaten';

    if (ball.kind !== kind) {
      ball.kind = kind;
      ball.tintedAt = world.time;
      isRetinted = true;
    }
  });

  return isRetinted;
}

/** Paces the planned changes: a pile that overflows pours faster, and a big overflow sheds in volleys. */
function paceChanges(world: BowlWorld): void {
  'worklet';
  let pile = 0;
  let overflow = 0;

  for (const change of world.changes) {
    if (change.action === 'drop' && change.kind === 'overflow') {
      overflow += change.count;
    } else if (change.action === 'drop' && change.kind !== 'placeholder') {
      pile += change.count;
    }
  }
  world.pileGap = overflow > 0 && pile > 0 ? Math.min(DROP_GAP, PILE_RUSH_SECONDS / pile) : DROP_GAP;
  world.volley = overflow > VOLLEY_FROM ? Math.min(VOLLEY_MAX, Math.ceil(overflow / VOLLEY_FROM)) : 1;
  world.volleyFrom = world.volley > 1 ? Math.floor(pile * VOLLEY_OVERLAP) : 0;
  world.nextVolleyAt = world.time;
}

/** Replaces whatever changes were still to come with the ones that reach `target` from the balls held now. */
export function retargetWorld(world: BowlWorld, target: BowlCounts): void {
  'worklet';
  world.changes = planBowlChanges(presentCounts(world), target);
  retintPile(world, target);
  paceChanges(world);
  world.stepGap = gapFor(world, world.changes[0]);
  world.nextStepAt = world.time;
  world.columnY = world.hasRested ? SPAWN_Y : FLOOR_COLUMN_Y;
  world.calmFor = 0;
  world.isRestRetinted = false;
}

/** Where an overflow ball starts over the rim on `side`, and how it is thrown. */
function shedPoint(world: BowlWorld, side: -1 | 1): { x: number; y: number; vx: number; vy: number } {
  'worklet';
  const reach = SHED_REACH.min + (SHED_REACH.max - SHED_REACH.min) * nextRandom(world);
  const out = SHED_SPEED.out.min + (SHED_SPEED.out.max - SHED_SPEED.out.min) * nextRandom(world);
  const up = SHED_SPEED.up.min + (SHED_SPEED.up.max - SHED_SPEED.up.min) * nextRandom(world);

  return { x: BOWL_CENTRE_X + side * reach, y: SHED_Y, vx: side * out, vy: -up };
}

function spawnPoint(world: BowlWorld, kind: BallKind, radius: number): { x: number; y: number; vx: number; vy: number } {
  'worklet';
  const spread = 2 * nextRandom(world) - 1;

  if (kind === 'placeholder') {
    return { x: BOWL_CENTRE_X + spread * 44, y: RIM_Y + INNER_RADIUS_Y - radius - 20, vx: 0, vy: 0 };
  }
  if (kind === 'overflow') {
    return shedPoint(world, world.nextSide);
  }

  return { x: BOWL_CENTRE_X + spread * SPAWN_SPREAD, y: SPAWN_Y, vx: (2 * nextRandom(world) - 1) * 30, vy: 60 };
}

function isClear(world: BowlWorld, x: number, y: number, radius: number): boolean {
  'worklet';
  for (const ball of world.balls) {
    const reach = radius + ball.radius + 1;
    const dx = ball.x - x;
    const dy = ball.y - y;

    if (dx * dx + dy * dy < reach * reach) {
      return false;
    }
  }

  return true;
}

interface NewBall {
  kind: BallKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

function addBall(world: BowlWorld, spawn: NewBall): void {
  'worklet';
  const { kind, x, y, vx, vy, radius } = spawn;

  world.balls.push({
    id: world.nextId,
    kind,
    x,
    y,
    previousX: x,
    previousY: y,
    vx,
    vy,
    radius,
    scale: 1,
    bornAt: world.time,
    removedAt: null,
    tintedAt: null,
    supported: false,
    wasSupported: false,
    seated: false,
  });
  world.nextId += 1;
}

function randomRadius(world: BowlWorld): number {
  'worklet';
  return AVERAGE_BALL_RADIUS * (1 - RADIUS_SPREAD + 2 * RADIUS_SPREAD * nextRandom(world));
}

const otherSide = (side: -1 | 1): -1 | 1 => {
  'worklet';
  return side === 1 ? -1 : 1;
};

/** After a single overflow ball, the next one mostly sheds over the other rim. */
function switchShedSide(world: BowlWorld): void {
  'worklet';
  if (nextRandom(world) < SWITCH_SIDE) {
    world.nextSide = otherSide(world.nextSide);
  }
}

/**
 * Drops a ball of `kind` where no ball already is. False when every spot tried was taken. A rushed pile ball tries
 * more spots, every other one a ball lower, so twice as many fit in the air above the bowl.
 */
function dropBall(world: BowlWorld, kind: BallKind): boolean {
  'worklet';
  const radius = randomRadius(world);
  const isRushed = isInPileKind(kind) && world.pileGap < DROP_GAP;

  for (let attempt = 0; attempt < (isRushed ? RUSH_SPAWN_TRIES : SPAWN_TRIES); attempt += 1) {
    const { x, y: spawnY, vx, vy } = spawnPoint(world, kind, radius);
    const y = isRushed ? spawnY + (attempt % 2) * COLUMN_STEP : spawnY;

    if (isClear(world, x, y, kind === 'overflow' ? radius + SHED_CLEARANCE : radius)) {
      addBall(world, { kind, x, y, vx, vy, radius });
      if (kind === 'overflow') {
        switchShedSide(world);
      }
      return true;
    }
  }
  // A ball resting at one rim's shedding spot sends the next try to the other rim.
  if (kind === 'overflow') {
    world.nextSide = otherSide(world.nextSide);
  }

  return false;
}

/**
 * Sheds up to `size` overflow balls over the rim on `side`, those of the volley's shape that have clear air: a pile
 * ball resting at the crown can block the shed spot itself for seconds. The balls shed.
 */
function shedVolley(world: BowlWorld, side: -1 | 1, size: number): number {
  'worklet';
  const members = VOLLEY_SHAPE.slice(0, size).map((offset) => ({ ...offset, radius: randomRadius(world) }));
  let best: NewBall[] = [];

  for (let attempt = 0; attempt < SPAWN_TRIES && best.length < members.length; attempt += 1) {
    const { x, y, vx, vy } = shedPoint(world, side);
    const clear = members
      .map(({ out, up, radius }) => ({
        kind: 'overflow' as const,
        x: x + side * out * VOLLEY_SPACING,
        y: y - up * VOLLEY_SPACING,
        vx: vx * VOLLEY_THROW,
        vy: vy * VOLLEY_THROW,
        radius,
      }))
      .filter((ball) => isClear(world, ball.x, ball.y, ball.radius + SHED_CLEARANCE));

    best = clear.length > best.length ? clear : best;
  }
  best.forEach((ball) => addBall(world, ball));

  return best.length;
}

/**
 * The rim whose volley is the bigger next: mostly alternating, never quite symmetrical, until the two piles differ by
 * VOLLEY_LEAN, when the lighter pile's rim sheds alone.
 */
function leadingSide(world: BowlWorld): { side: -1 | 1; isAlone: boolean } {
  'worklet';
  let lean = 0;

  for (const ball of world.balls) {
    if (ball.kind === 'overflow' && ball.removedAt === null) {
      lean += ball.x < BOWL_CENTRE_X ? -1 : 1;
    }
  }
  if (Math.abs(lean) >= VOLLEY_LEAN) {
    world.nextSide = lean > 0 ? -1 : 1;

    return { side: world.nextSide, isAlone: true };
  }
  switchShedSide(world);

  return { side: world.nextSide, isAlone: false };
}

/** One step of a big overflow: a full volley over the leading rim and, unless it sheds alone, one fewer over the other. */
function shedVolleys(world: BowlWorld, remaining: number): number {
  'worklet';
  const { side, isAlone } = leadingSide(world);
  const led = shedVolley(world, side, Math.min(world.volley, remaining));
  const trailSize = isAlone ? 0 : Math.min(world.volley - 1, remaining - led);

  return led + (trailSize > 0 ? shedVolley(world, otherSide(side), trailSize) : 0);
}

/** Drops the next of `kind`: one ball, or a step of volleys for a big overflow. The balls dropped, 0 when blocked. */
function dropStep(world: BowlWorld, kind: BallKind, remaining: number): number {
  'worklet';
  if (kind === 'overflow' && world.volley > 1) {
    return shedVolleys(world, remaining);
  }

  return dropBall(world, kind) ? 1 : 0;
}

function isOutsideTrack(x: number, y: number, radius: number): boolean {
  'worklet';
  return ((x - BOWL_CENTRE_X) / (OUTER_RADIUS_X + radius)) ** 2 + ((y - RIM_Y) / (OUTER_RADIUS_Y + radius)) ** 2 >= 1;
}

/** Unseen, a spot for an overflow ball anywhere outside the track, between the ground and the rims. */
function groundSpot(world: BowlWorld, radius: number): { x: number; y: number } | null {
  'worklet';
  const { minX, maxX } = world.ground;
  const x = minX + radius + (maxX - minX - 2 * radius) * nextRandom(world);
  const y = RIM_Y + (GROUND_Y - RIM_Y - radius) * nextRandom(world);

  return isOutsideTrack(x, y, radius) ? { x, y } : null;
}

/** Unseen, a spot for a pile ball at the top of the column the change falls in as: inside the bowl's walls below the rims. */
function columnSpot(world: BowlWorld): { x: number; y: number } {
  'worklet';
  const depth = (world.columnY - RIM_Y) / (FLOOR_COLUMN_Y - RIM_Y);
  const reach = depth > 0 ? (INNER_RADIUS_X - MAX_BALL_RADIUS - 1) * Math.sqrt(Math.max(0, 1 - depth * depth)) : SPAWN_SPREAD;

  return { x: BOWL_CENTRE_X + (2 * nextRandom(world) - 1) * reach, y: world.columnY };
}

/**
 * Unseen, places a ball of `kind` with no stream to watch: a pile ball in a column above the bowl that rises as it
 * fills, an overflow ball on the ground outside the track. False when no spot tried was free.
 */
function placeBall(world: BowlWorld, kind: BallKind): boolean {
  'worklet';
  if (kind === 'placeholder') {
    return dropBall(world, kind);
  }
  const radius = randomRadius(world);

  for (let attempt = 1; attempt <= UNSEEN_TRIES; attempt += 1) {
    const spot = kind === 'overflow' ? groundSpot(world, radius) : columnSpot(world);

    if (spot !== null && isClear(world, spot.x, spot.y, radius)) {
      addBall(world, { kind, x: spot.x, y: spot.y, vx: 0, vy: 0, radius });
      if (kind === 'overflow') {
        switchShedSide(world);
      }
      return true;
    }
    if (kind !== 'overflow' && attempt % SPAWN_TRIES === 0) {
      world.columnY -= COLUMN_STEP;
    }
  }

  return false;
}

/** Starts removing the highest ball of `group` still in the world. */
function removeTopBall(world: BowlWorld, group: BallGroup): void {
  'worklet';
  let top: Ball | null = null;

  for (const ball of world.balls) {
    const isInGroup = group === 'pile' ? isInPile(ball) : ball.kind === group;

    if (isInGroup && ball.removedAt === null && (top === null || ball.y < top.y)) {
      top = ball;
    }
  }
  if (top !== null) {
    top.removedAt = world.time;
  }
}

/** Counts `done` balls of the change under way as dropped or removed, moving on to the next change after its last. */
function completeStep(world: BowlWorld, current: BowlChange, done = 1): void {
  'worklet';
  if (current.count > done) {
    world.changes[0] = { ...current, count: current.count - done };
  } else {
    world.changes.shift();
    world.stepGap = gapFor(world, world.changes[0]);
  }
}

/** A big overflow starts its volleys while the last of the pile still pours, on a clock of its own. */
function applyDueVolleys(world: BowlWorld): void {
  'worklet';
  const [pile, overflow] = world.changes;

  if (pile?.action !== 'drop' || !isInPileKind(pile.kind) || overflow?.action !== 'drop' || overflow.kind !== 'overflow') {
    return;
  }
  if (pile.count > world.volleyFrom || world.time < world.nextVolleyAt) {
    return;
  }
  const shed = shedVolleys(world, overflow.count);

  world.nextVolleyAt = world.time + VOLLEY_GAP;
  if (shed >= overflow.count) {
    world.changes.splice(1, 1);
  } else if (shed > 0) {
    world.changes[1] = { ...overflow, count: overflow.count - shed };
  }
}

function applyDueChanges(world: BowlWorld): void {
  'worklet';
  applyDueVolleys(world);
  for (let actions = 0; actions < ACTIONS_PER_FRAME && world.time >= world.nextStepAt; actions += 1) {
    const current = world.changes[0];
    let done = 1;

    if (current === undefined) {
      return;
    }
    if (current.action === 'drop') {
      done = dropStep(world, current.kind, current.count);
    }
    if (done === 0) {
      world.nextStepAt = world.time + world.stepGap;
      return;
    }
    if (current.action === 'remove') {
      removeTopBall(world, current.group);
    }

    world.nextStepAt += world.stepGap;
    completeStep(world, current, done);
  }
  // A stalled frame resumes the stream where it is rather than pouring the backlog in at once.
  world.nextStepAt = Math.max(world.nextStepAt, world.time - world.stepGap);
}

/** Unseen, nothing is streamed: every change is made at once, as far as there is room for the balls it places. */
function applyChangesAtOnce(world: BowlWorld): void {
  'worklet';
  for (let current = world.changes[0]; current !== undefined; current = world.changes[0]) {
    if (current.action === 'drop' && !placeBall(world, current.kind)) {
      return;
    }
    if (current.action === 'remove') {
      removeTopBall(world, current.group);
    }
    completeStep(world, current);
  }
}

/** Shrinks each ball on its way out, and drops it from the world once its removal has played. */
function updateRemovals(world: BowlWorld): void {
  'worklet';
  let kept = 0;

  for (const ball of world.balls) {
    const progress = ball.removedAt === null ? 0 : (world.time - ball.removedAt) / REMOVE_SECONDS;

    if (progress >= 1) {
      continue;
    }
    ball.scale = 1 - 0.4 * progress;
    world.balls[kept] = ball;
    kept += 1;
  }
  world.balls.length = kept;
}

function fastestSpeed(balls: readonly Ball[]): number {
  'worklet';
  let fastest = 0;

  for (const ball of balls) {
    fastest = Math.max(fastest, ball.vx * ball.vx + ball.vy * ball.vy);
  }

  return Math.sqrt(fastest);
}

export interface AdvanceOptions {
  /** Nobody watches the world move (reduce motion), so changes are made at once rather than streamed. */
  isUnseen?: boolean | undefined;
}

/** Moves the world on by one frame of `seconds`: due drops and removals, then the physics in whole substeps. */
export function advanceWorld(world: BowlWorld, seconds: number, options: AdvanceOptions = {}): void {
  'worklet';
  const frame = Math.min(Math.max(seconds, 0), LONGEST_FRAME);

  world.time += frame;
  if (options.isUnseen === true) {
    applyChangesAtOnce(world);
  } else {
    applyDueChanges(world);
  }
  updateRemovals(world);
  world.unspent += frame;

  while (world.unspent >= SUBSTEP) {
    stepPhysics(world.balls, world.contacts, world.ground);
    world.unspent -= SUBSTEP;
  }

  world.calmFor = fastestSpeed(world.balls) < SLEEP_SPEED ? world.calmFor + frame : 0;
  // Coral dropped before it settled can rest above a white: the first time the world is calm after a change, the
  // lowest N by height are coral again, and a re-colouring keeps it awake to play its fade. Only then: a rested pile
  // still creeps, and a later re-colouring would start a fade after the frame loop has stopped.
  if (!world.isRestRetinted && world.changes.length === 0 && world.calmFor >= SLEEP_AFTER) {
    world.isRestRetinted = true;
    world.calmFor = retintPile(world, presentCounts(world)) ? 0 : world.calmFor;
  }
}

/** True once every change has played out, every ball has come to rest and every fade has played, so the loop can stop. */
export function isWorldSettled(world: BowlWorld): boolean {
  'worklet';
  if (world.changes.length > 0 || world.calmFor < SLEEP_AFTER) {
    return false;
  }

  return world.balls.every(
    (ball) =>
      ball.removedAt === null &&
      world.time - ball.bornAt >= APPEAR_SECONDS &&
      (ball.tintedAt === null || world.time - ball.tintedAt >= TINT_SECONDS),
  );
}

export interface FrameOptions {
  /** Seconds since the last displayed frame. */
  seconds: number;
  /** Nobody watches (reduce motion): world frames play until it settles or `now()` reaches `deadline`. */
  unseen?: { deadline: number; now: () => number } | undefined;
}

/** Plays the world for one displayed frame. True when that frame should draw it: unseen, only once it has settled. */
export function playFrame(world: BowlWorld, options: FrameOptions): boolean {
  'worklet';
  const { seconds, unseen } = options;

  if (unseen === undefined) {
    advanceWorld(world, seconds);
    return true;
  }
  do {
    advanceWorld(world, UNSEEN_FRAME_SECONDS, { isUnseen: true });
  } while (!isWorldSettled(world) && unseen.now() < unseen.deadline);
  world.hasRested = world.hasRested || isWorldSettled(world);

  return isWorldSettled(world);
}

/** The radius a ball is drawn at: scaling in from 0.7 as it appears, and down to 0.6 as it leaves. */
export function drawnRadius(ball: Ball, time: number): number {
  'worklet';
  const appeared = Math.min(1, (time - ball.bornAt) / APPEAR_SECONDS);

  return ball.radius * ball.scale * (0.7 + 0.3 * (1 - (1 - appeared) ** 2));
}

/** How far a pile ball is through its change of colour, 0 to 1; 1 when it has not changed. */
export function tintProgress(ball: Ball, time: number): number {
  'worklet';
  return ball.tintedAt === null ? 1 : Math.min(1, (time - ball.tintedAt) / TINT_SECONDS);
}

/** The opacity a ball is drawn at: fading out while it is removed. */
export function drawnOpacity(ball: Ball, time: number): number {
  'worklet';
  return ball.removedAt === null ? 1 : Math.max(0, 1 - (time - ball.removedAt) / REMOVE_SECONDS);
}
