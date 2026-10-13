// The phone and tablet sheet's two heights, and where a drag on its handle leaves it. Pure.

export type Snap = 'half' | 'full';

const FLING = 0.5; // px/ms: a flick this fast goes on to the next height whatever the distance
const DOWN = 96; // px dragged down to go a height lower
const UP = 64; // px dragged up to go to full height

export interface Drag {
  /** the height it was at when the drag began */
  from: Snap;
  /** how far the handle moved, down positive (px) */
  dy: number;
  /** how fast it was moving when let go, down positive (px/ms) */
  vy: number;
  /** the sheet's height when the drag began (px) */
  height: number;
  /** the screen is tall enough for a half-height sheet */
  canHalf: boolean;
}

/** Where the sheet goes when the handle is let go: a height, or closed. */
export function settle({ from, dy, vy, height, canHalf }: Drag): Snap | 'closed' {
  if (vy > FLING || dy > DOWN) {
    // Pulled most of the way down closes it from any height.
    if (from === 'half' || !canHalf || dy > height * 0.6) return 'closed';
    return 'half';
  }
  if (vy < -FLING || dy < -UP) return 'full';
  return from;
}
