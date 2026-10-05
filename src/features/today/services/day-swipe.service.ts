/** How far a drag must travel, or how fast it must be flung, to change the day. */
const COMMIT_PX = 60;
const FLING_PX_PER_SECOND = 500;

export type SwipedDay = 'previous' | 'next';

interface Swipe {
  translationX: number;
  velocityX: number;
}

/** A swipe right shows the day before and a swipe left the day after; a drag flung back the other way stays. */
export function swipedDay({ translationX, velocityX }: Swipe): SwipedDay | null {
  const direction = Math.sign(translationX);
  const isFling = Math.abs(velocityX) >= FLING_PX_PER_SECOND;

  if (direction === 0 || (isFling && Math.sign(velocityX) === -direction)) {
    return null;
  }

  if (Math.abs(translationX) < COMMIT_PX && !isFling) {
    return null;
  }

  return direction > 0 ? 'previous' : 'next';
}
