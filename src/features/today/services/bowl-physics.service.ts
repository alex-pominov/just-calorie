import type { Ball } from '../types/bowl.types';
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

// Position-based dynamics in fixed substeps: move, push every overlap apart, derive velocity from the move,
// then bounce and rub along each contact found. Every function is a worklet, because the simulation runs on
// the UI thread. Nothing here allocates: balls and contacts are mutated in place and contact arguments are
// positional, because this runs 480 times a second over up to 160 balls and ~1,500 contacts.

/** One substep, in seconds. A ball moves under 2px per substep at the fastest it falls, so none tunnels. */
export const SUBSTEP = 1 / 480;
/** px/s², heavy enough that a ball dropped into the empty bowl lands in under half a second. */
export const GRAVITY = 1500;
/** Overlap passes per substep. One lets a fast pour slosh up the walls like a liquid; two keeps it a heap. */
const PASSES = 2;
/**
 * Bounce passes per substep. One lets an impact sink into the pile; with several, the balls under a struck ball
 * push back, so a landing ball bounces and the balls it hits are knocked and pass the push on.
 */
const VELOCITY_PASSES = 4;
/** The largest radius a ball can have, which bounds how far apart two touching centres can be. */
export const MAX_BALL_RADIUS = 8.8;

/** Balls bounce off each other livelier than off the bowl, so a landing visibly knocks the pile it lands on. */
const BALL_RESTITUTION = 0.75;
const WALL_RESTITUTION = 0.3;
/** Overflow bounces off the rim and off itself as it piles up outside, a little less than the pile does. */
const OVERFLOW_RESTITUTION = 0.5;
const FRICTION = 0.3;
/** A ball resting on something meets an impact as this much heavier, as if partly backed by what holds it. */
const SUPPORTED_MASS = 1.5;
/** A wall grips by how level it is: a floor at FRICTION, a vertical wall at this, so no column leans on one. */
const STEEP_WALL_FRICTION = 0.08;
/** Below this approach speed (px/s) a contact does not bounce, so a resting pile stays still. */
const BOUNCE_THRESHOLD = 15;
const DAMPING_PER_SUBSTEP = Math.exp(-0.3 * SUBSTEP);
/** How far above the rims (px) a full bowl may heap at its middle, as the height of the lid over the rims. */
const LID_RISE = 26;
/** How far above the rims the lid's ends sit, so a full bowl is full right up to its rims. */
const LID_EDGE_RISE = 8;
/** The average ball's radius, which the lid is fitted to: its arc passes through both rims for that ball's centre. */
export const AVERAGE_BALL_RADIUS = 8;
const LID_HALF_SPAN = INNER_RADIUS_X - AVERAGE_BALL_RADIUS;
const LID_SAG = LID_RISE - LID_EDGE_RISE;
const LID_RADIUS = (LID_HALF_SPAN * LID_HALF_SPAN + LID_SAG * LID_SAG) / (2 * LID_SAG);
const LID_CENTRE_Y = RIM_Y - LID_RISE + LID_RADIUS;
/**
 * Overflow rubs only on contacts this level. With friction on the bowl a ball balances on a rim's crown, and the next
 * one rolls off it back into the bowl.
 */
const LEVEL_GROUND = 0.999;
/** A held ball slower than this (px/s) loses REST_DAMPING of its speed each substep, so a pile stops creeping. */
const REST_SPEED = 4;
const REST_DAMPING = 0.1;
/** px; a correction smaller than this is rounding, not a contact. */
const MIN_DEPTH = 1e-6;
/** A contact whose normal points this far up holds the ball above it. */
const SUPPORT_NORMAL = 0.5;

const INNER_RADIUS_MEAN = (INNER_RADIUS_X + INNER_RADIUS_Y) / 2;
const OUTER_RADIUS_MEAN = (OUTER_RADIUS_X + OUTER_RADIUS_Y) / 2;

/** The x of the ground's two ends, in the bowl's frame: where overflow meets its side walls. */
export interface Ground {
  minX: number;
  maxX: number;
}

/** The contacts found in one substep, as parallel arrays reused from substep to substep. */
export interface Contacts {
  /** Index of the lower-x ball, or -1 when the contact is with the bowl, the ground or a side. */
  first: number[];
  second: number[];
  /** The unit normal, from the first body towards the second. */
  normalX: number[];
  normalY: number[];
  /** Normal speed of the second body relative to the first before the substep; negative while closing. */
  approach: number[];
  /** How far the pair was pushed apart, which bounds the friction the contact can apply. */
  depth: number[];
  count: number;
}

export function createContacts(): Contacts {
  'worklet';
  return { first: [], second: [], normalX: [], normalY: [], approach: [], depth: [], count: 0 };
}

/** Mass goes with area, so the solver moves each ball of a pair by the other's share of their masses. */
function massOf(ball: Ball): number {
  'worklet';
  return ball.radius * ball.radius * (ball.wasSupported ? SUPPORTED_MASS : 1);
}

/** The radius a ball collides with: its own, shrunk while it is being removed. */
function reachOf(ball: Ball): number {
  'worklet';
  return ball.radius * ball.scale;
}

function addContact(
  contacts: Contacts,
  first: number,
  second: number,
  normalX: number,
  normalY: number,
  approach: number,
  depth: number,
): void {
  'worklet';
  const index = contacts.count;
  contacts.first[index] = first;
  contacts.second[index] = second;
  contacts.normalX[index] = normalX;
  contacts.normalY[index] = normalY;
  contacts.approach[index] = approach;
  contacts.depth[index] = depth;
  contacts.count = index + 1;
}

function integrate(balls: Ball[]): void {
  'worklet';
  for (const ball of balls) {
    ball.wasSupported = ball.supported;
    ball.supported = false;
    ball.vx *= DAMPING_PER_SUBSTEP;
    ball.vy = (ball.vy + GRAVITY * SUBSTEP) * DAMPING_PER_SUBSTEP;
    ball.previousX = ball.x;
    ball.previousY = ball.y;
    ball.x += ball.vx * SUBSTEP;
    ball.y += ball.vy * SUBSTEP;
  }
}

/** Insertion sort by x: the order barely changes between substeps, so this is close to one pass. */
function sortByX(balls: Ball[]): void {
  'worklet';
  for (let index = 1; index < balls.length; index += 1) {
    const ball = balls[index];
    let before = index - 1;
    let previous = balls[before];

    if (ball === undefined) {
      continue;
    }

    while (previous !== undefined && previous.x > ball.x) {
      balls[before + 1] = previous;
      before -= 1;
      previous = balls[before];
    }
    balls[before + 1] = ball;
  }
}

function separate(balls: Ball[], first: number, second: number, contacts: Contacts): void {
  'worklet';
  const a = balls[first];
  const b = balls[second];

  if (a === undefined || b === undefined) {
    return;
  }

  const reach = reachOf(a) + reachOf(b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= reach * reach) {
    return;
  }

  const distance = Math.sqrt(distanceSquared);
  const normalX = distance > 0 ? dx / distance : 0;
  const normalY = distance > 0 ? dy / distance : 1;
  const depth = reach - distance;
  const massA = massOf(a);
  const massB = massOf(b);
  const shareA = massB / (massA + massB);
  const shareB = 1 - shareA;
  const approach = (b.vx - a.vx) * normalX + (b.vy - a.vy) * normalY;

  a.x -= normalX * depth * shareA;
  a.y -= normalY * depth * shareA;
  b.x += normalX * depth * shareB;
  b.y += normalY * depth * shareB;
  addContact(contacts, first, second, normalX, normalY, approach, depth);
}

function collideBalls(balls: Ball[], contacts: Contacts): void {
  'worklet';
  for (let first = 0; first < balls.length; first += 1) {
    const a = balls[first];

    if (a === undefined) {
      continue;
    }

    const reachA = reachOf(a);
    const farthest = a.x + reachA + MAX_BALL_RADIUS;

    for (let second = first + 1; second < balls.length; second += 1) {
      const b = balls[second];

      if (b === undefined || b.x >= farthest) {
        break;
      }

      // Rejected inline before any call: on the UI thread's interpreter a call per candidate pair costs a frame.
      const reach = reachA + b.radius * b.scale;
      const dx = b.x - a.x;
      const dy = b.y - a.y;

      if (dy < reach && dy > -reach && dx * dx + dy * dy < reach * reach) {
        separate(balls, first, second, contacts);
      }
    }
  }
}

/** Moves a ball to `toX, toY` and records the wall contact, its normal pointing from the wall into the ball. */
function pushOff(contacts: Contacts, index: number, ball: Ball, toX: number, toY: number): void {
  'worklet';
  const dx = toX - ball.x;
  const dy = toY - ball.y;
  const depth = Math.sqrt(dx * dx + dy * dy);

  // A ball already on the surface to rounding error has no direction to be pushed in: a contact recorded with that
  // noise as its normal would cancel the ball's speed along it, and a wall would quietly stop whatever touched it.
  if (depth < MIN_DEPTH) {
    return;
  }

  const normalX = dx / depth;
  const normalY = dy / depth;

  ball.x = toX;
  ball.y = toY;
  addContact(contacts, -1, index, normalX, normalY, ball.vx * normalX + ball.vy * normalY, depth);
}

/** Keeps a ball inside the inner ellipse, shrunk by its radius, below the rims. Above them it may go anywhere. */
function keepInsideBowl(ball: Ball, index: number, contacts: Contacts): void {
  'worklet';
  const dy = ball.y - RIM_Y;

  if (dy <= 0) {
    return;
  }

  const radiusX = INNER_RADIUS_X - reachOf(ball);
  const radiusY = INNER_RADIUS_Y - reachOf(ball);
  const dx = ball.x - BOWL_CENTRE_X;
  const u = dx / radiusX;
  const v = dy / radiusY;
  const scaledSquared = u * u + v * v;

  if (scaledSquared > 1) {
    const scaled = Math.sqrt(scaledSquared);

    pushOff(contacts, index, ball, BOWL_CENTRE_X + dx / scaled, RIM_Y + dy / scaled);
  }
}

/** How far a ball's centre may be from the lid's centre: the lid is fitted to an average ball's centre. */
function lidReach(ball: Ball): number {
  'worklet';
  return LID_RADIUS + AVERAGE_BALL_RADIUS - reachOf(ball);
}

/** Keeps a ball under the lid, the shallow arc spanning the rims. */
function keepUnderLid(ball: Ball, index: number, contacts: Contacts): void {
  'worklet';
  const dx = ball.x - BOWL_CENTRE_X;
  const dy = ball.y - LID_CENTRE_Y;
  const distanceSquared = dx * dx + dy * dy;
  const reach = lidReach(ball);

  if (ball.y < RIM_Y && distanceSquared > reach * reach) {
    const distance = Math.sqrt(distanceSquared);

    pushOff(contacts, index, ball, BOWL_CENTRE_X + (dx / distance) * reach, LID_CENTRE_Y + (dy / distance) * reach);
  }
}

/** Keeps a ball outside the outer ellipse, grown by its radius. */
function keepOutsideBowl(ball: Ball, index: number, contacts: Contacts): void {
  'worklet';
  const dy = ball.y - RIM_Y;
  const radiusX = OUTER_RADIUS_X + reachOf(ball);
  const radiusY = OUTER_RADIUS_Y + reachOf(ball);
  const dx = ball.x - BOWL_CENTRE_X;
  const u = dx / radiusX;
  const v = Math.max(dy, 0) / radiusY;
  const scaledSquared = u * u + v * v;
  const scaled = scaledSquared < 1 ? Math.sqrt(scaledSquared) : 1;

  if (scaled < 1 && scaled > 0) {
    pushOff(contacts, index, ball, BOWL_CENTRE_X + dx / scaled, RIM_Y + Math.max(dy, 0) / scaled);
  }
}

/**
 * Inside balls (placeholders, carry-over, eaten) fall in down the bowl's width. Once in, a lid holds them: a shallow
 * arc LID_RISE over the rims at the middle and LID_EDGE_RISE at each end. So a full bowl is full to its rims and
 * heaps a little in the middle, and never stacks up a wall.
 */
function containInsideBall(ball: Ball, index: number, contacts: Contacts): void {
  'worklet';
  const dx = ball.x - BOWL_CENTRE_X;
  const fromLidY = ball.y - LID_CENTRE_Y;
  const limit = INNER_RADIUS_X - reachOf(ball);

  ball.seated =
    ball.seated || ball.y >= RIM_Y - LID_EDGE_RISE || dx * dx + fromLidY * fromLidY <= lidReach(ball) ** 2;

  if (ball.y < RIM_Y && Math.abs(dx) > limit) {
    pushOff(contacts, index, ball, BOWL_CENTRE_X + Math.sign(dx) * limit, ball.y);
  }
  if (ball.seated) {
    keepUnderLid(ball, index, contacts);
    keepInsideBowl(ball, index, contacts);
  }
}

function collideWithRim(contacts: Contacts, index: number, ball: Ball, rimX: number): void {
  'worklet';
  const reach = RIM_RADIUS + reachOf(ball);
  const dx = ball.x - rimX;
  const dy = ball.y - RIM_Y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < reach && distance > 0) {
    pushOff(contacts, index, ball, rimX + (dx / distance) * reach, RIM_Y + (dy / distance) * reach);
  }
}

/** Overflow balls meet the whole track: its inside, both rims, its outside, then the ground and the sides. */
function containOverflowBall(ball: Ball, index: number, contacts: Contacts, ground: Ground): void {
  'worklet';
  collideWithRim(contacts, index, ball, RIM_CENTRE_LEFT_X);
  collideWithRim(contacts, index, ball, RIM_CENTRE_RIGHT_X);

  const dx = ball.x - BOWL_CENTRE_X;
  const dy = ball.y - RIM_Y;

  if (dy > 0) {
    const inner = Math.sqrt((dx / INNER_RADIUS_X) ** 2 + (dy / INNER_RADIUS_Y) ** 2);
    const outer = Math.sqrt((dx / OUTER_RADIUS_X) ** 2 + (dy / OUTER_RADIUS_Y) ** 2);
    // A centre inside the track itself goes back out through the nearer face.
    const isInside = inner < 1 || (outer <= 1 && (inner - 1) * INNER_RADIUS_MEAN < (1 - outer) * OUTER_RADIUS_MEAN);

    if (isInside) {
      keepInsideBowl(ball, index, contacts);
    } else {
      keepOutsideBowl(ball, index, contacts);
    }
  }

  const reach = reachOf(ball);

  if (ball.y > GROUND_Y - reach) {
    pushOff(contacts, index, ball, ball.x, GROUND_Y - reach);
  }
  if (ball.x < ground.minX + reach) {
    pushOff(contacts, index, ball, ground.minX + reach, ball.y);
  }
  if (ball.x > ground.maxX - reach) {
    pushOff(contacts, index, ball, ground.maxX - reach, ball.y);
  }
}

function collideWithBowl(balls: Ball[], contacts: Contacts, ground: Ground): void {
  'worklet';
  for (let index = 0; index < balls.length; index += 1) {
    const ball = balls[index];

    if (ball === undefined) {
      continue;
    }
    if (ball.kind === 'overflow') {
      containOverflowBall(ball, index, contacts, ground);
    } else {
      containInsideBall(ball, index, contacts);
    }
  }
}

function deriveVelocities(balls: Ball[]): void {
  'worklet';
  for (const ball of balls) {
    ball.vx = (ball.x - ball.previousX) / SUBSTEP;
    ball.vy = (ball.y - ball.previousY) / SUBSTEP;
  }
}

function dampResting(balls: Ball[]): void {
  'worklet';
  for (const ball of balls) {
    if (ball.supported && ball.vx * ball.vx + ball.vy * ball.vy < REST_SPEED * REST_SPEED) {
      ball.vx *= 1 - REST_DAMPING;
      ball.vy *= 1 - REST_DAMPING;
    }
  }
}

/**
 * Sets each contact's normal speed to its bounce, and on the first pass rubs off tangential speed up to the friction
 * limit: friction applied on every pass would multiply it.
 */
function resolveContacts(balls: Ball[], contacts: Contacts, isFirstPass: boolean): void {
  'worklet';
  for (let index = 0; index < contacts.count; index += 1) {
    const firstIndex = contacts.first[index] ?? -1;
    const a = firstIndex < 0 ? undefined : balls[firstIndex];
    const b = balls[contacts.second[index] ?? 0];
    const normalX = contacts.normalX[index] ?? 0;
    const normalY = contacts.normalY[index] ?? 0;
    const approach = contacts.approach[index] ?? 0;
    const depth = contacts.depth[index] ?? 0;

    if (b === undefined) {
      continue;
    }

    const relativeX = b.vx - (a?.vx ?? 0);
    const relativeY = b.vy - (a?.vy ?? 0);
    const normalSpeed = relativeX * normalX + relativeY * normalY;
    const tangentX = relativeX - normalSpeed * normalX;
    const tangentY = relativeY - normalSpeed * normalY;
    const tangentSpeed = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    const isOverflow = b.kind === 'overflow' || a?.kind === 'overflow';
    const restitution = isOverflow ? OVERFLOW_RESTITUTION : a === undefined ? WALL_RESTITUTION : BALL_RESTITUTION;
    const bounce = approach < -BOUNCE_THRESHOLD ? -restitution * approach : 0;
    const normalChange = bounce - normalSpeed;
    const levelness = Math.max(0, -normalY);
    const isSliding = isOverflow && levelness < LEVEL_GROUND;
    const wallFriction = isSliding ? 0 : STEEP_WALL_FRICTION + (FRICTION - STEEP_WALL_FRICTION) * levelness;
    const friction = a === undefined ? wallFriction : FRICTION;
    const rub = isFirstPass && tangentSpeed > 0 ? -Math.min((friction * depth) / SUBSTEP, tangentSpeed) / tangentSpeed : 0;
    const changeX = normalX * normalChange + tangentX * rub;
    const changeY = normalY * normalChange + tangentY * rub;

    if (a === undefined) {
      b.vx += changeX;
      b.vy += changeY;
      b.supported = b.supported || normalY < -SUPPORT_NORMAL;
      continue;
    }

    const massA = massOf(a);
    const massB = massOf(b);
    const shareA = massB / (massA + massB);

    a.vx -= changeX * shareA;
    a.vy -= changeY * shareA;
    b.vx += changeX * (1 - shareA);
    b.vy += changeY * (1 - shareA);
    a.supported = a.supported || normalY > SUPPORT_NORMAL;
    b.supported = b.supported || normalY < -SUPPORT_NORMAL;
  }
}

/** Advances every ball by one SUBSTEP. Reorders `balls` by x, which nothing outside the simulation relies on. */
export function stepPhysics(balls: Ball[], contacts: Contacts, ground: Ground): void {
  'worklet';
  integrate(balls);
  sortByX(balls);
  contacts.count = 0;

  for (let pass = 0; pass < PASSES; pass += 1) {
    collideBalls(balls, contacts);
    collideWithBowl(balls, contacts, ground);
  }
  deriveVelocities(balls);

  for (let pass = 0; pass < VELOCITY_PASSES; pass += 1) {
    resolveContacts(balls, contacts, pass === 0);
  }
  dampResting(balls);
}
