// Which sprite she shows. Pure functions of what is happening to her (see public/noora for the sprites).

const STILL = 40; // px/s: below this the hand is as good as still, so she keeps facing the way she was

/**
 * Which way a hand moving at (vx, vy) px/s is heading: 'left' | 'right' | 'up' | 'down'.
 * She only turns when the new direction is clearly the main one, so a wobbly diagonal does not spin her.
 */
export function heading(vx, vy, current = null) {
  if (current && Math.hypot(vx, vy) < STILL) return current;
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const wasSideways = current === 'left' || current === 'right';
  const sideways = current ? (wasSideways ? ay < ax * 1.6 : ax > ay * 1.6) : ax >= ay;
  if (sideways) return vx < 0 ? 'left' : 'right';
  return vy < 0 ? 'up' : 'down';
}

/** How far she leans into the carry, in degrees: the faster sideways, the more (up to 9°). */
export function lean(vx) {
  return Math.round(Math.max(-9, Math.min(9, vx / 60)) * 10) / 10;
}

/**
 * Her sprite while she is carried. Sideways she walks: two frames, 'walk' and 'side', swapped by
 * `step` while the hand keeps moving; held still she stands side-on. Carried up she shows her back,
 * carried down she faces you.
 */
function carriedPose({ dir, moving }, step) {
  if (dir === 'up') return 'back';
  if (dir === 'down') return 'idle';
  return moving && step ? `walk-${dir}` : `side-${dir}`;
}

/**
 * The one pose to show right now. What is done to her comes first, then what the chat is doing,
 * then idle curiosity.
 * @param carry    { dir, moving } while she is being dragged, else null
 * @param step     0 | 1, the walk-cycle frame
 * @param pressed  the pointer is down on her and has not moved yet
 * @param dropped  she was put down a moment ago
 * @param chat     'talking' | 'happy' | 'sad' | null: what the open chat asks of her
 * @param lively   the pointer is over her, or she has keyboard focus
 */
export function choosePose({ carry, step, pressed, dropped, chat, lively }) {
  if (carry) return carriedPose(carry, step);
  if (pressed) return 'surprised';
  if (dropped) return 'happy';
  if (chat) return chat;
  if (lively) return 'excited';
  return 'idle';
}
