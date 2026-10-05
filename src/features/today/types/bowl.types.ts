/** What a ball in the bowl stands for, which sets its colour. Carry-over and eaten balls are one pile. */
export type BallKind = 'placeholder' | 'carry-over' | 'eaten' | 'overflow';

/** The groups balls leave the bowl by, each from its top: the pile leaves whatever each ball's colour. */
export type BallGroup = 'placeholder' | 'pile' | 'overflow';

/** How many balls of each kind the bowl holds for a day. */
export type BowlCounts = Readonly<Record<BallKind, number>>;

export interface BowlInput {
  /** Entries plus the carry-over when it was added. */
  totalKcal: number;
  /** The carry-over counted in the total; 0 when withheld. */
  addedCarryOverKcal: number;
  capKcal: number;
}

/** What the bowl shows for a day: its balls by kind, and the state of its track. */
export interface BowlState {
  counts: BowlCounts;
  isOverCap: boolean;
  /** The share of the track the white arc covers, 0 to 1; 0 draws no arc. */
  arcFraction: number;
}

/** One step from the balls in the bowl towards the balls a day needs: a stream of drops, or of removals. */
export type BowlChange =
  | { action: 'drop'; kind: BallKind; count: number }
  | { action: 'remove'; group: BallGroup; count: number };

/** A ball in the simulation. Positions are in the bowl's frame (Figma 5:2025), y down. */
export interface Ball {
  id: number;
  kind: BallKind;
  x: number;
  y: number;
  /** Where the ball was at the start of the current substep. */
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  radius: number;
  /** The share of its radius the ball fills: 1, shrinking towards 0.6 while it is removed. */
  scale: number;
  /** World time it appeared, which drives its scale-in. */
  bornAt: number;
  /** World time its removal began, or null while it stays. */
  removedAt: number | null;
  /** World time a pile ball last changed between carry-over and eaten, which drives its colour fade. */
  tintedAt: number | null;
  /** Whether something holds it up in this substep, and whether something did in the one before. */
  supported: boolean;
  wasSupported: boolean;
  /** Whether an inside ball has dropped into the bowl, after which the lid over the bowl holds it in. */
  seated: boolean;
}
