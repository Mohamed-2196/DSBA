// Which sprite she shows. Pure functions of what is happening to her (see public/noora for the sprites).
import type { Pose } from './sprites';

export type Heading = 'left' | 'right' | 'up' | 'down';
export type ChatMood = 'talking' | 'happy' | 'sad';

export interface Carry {
  dir: Heading;
  moving: boolean;
}

const STILL = 40; // px/s: below this the hand is as good as still, so she keeps facing the way she was

/**
 * Which way a hand moving at (vx, vy) px/s is heading.
 * She only turns when the new direction is clearly the main one, so a wobbly diagonal does not spin her.
 */
export function heading(vx: number, vy: number, current: Heading | null = null): Heading {
  if (current && Math.hypot(vx, vy) < STILL) return current;
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const wasSideways = current === 'left' || current === 'right';
  const sideways = current ? (wasSideways ? ay < ax * 1.6 : ax > ay * 1.6) : ax >= ay;
  if (sideways) return vx < 0 ? 'left' : 'right';
  return vy < 0 ? 'up' : 'down';
}

/** How far she leans into the carry, in degrees: the faster sideways, the more (up to 9°). */
export function lean(vx: number): number {
  return Math.round(Math.max(-9, Math.min(9, vx / 60)) * 10) / 10;
}

/**
 * Her sprite while she is carried. Sideways she walks: two frames, 'walk' and 'side', swapped by
 * `step` while the hand keeps moving; held still she stands side-on. Carried up she shows her back,
 * carried down she faces you.
 */
function carriedPose({ dir, moving }: Carry, step: 0 | 1): Pose {
  if (dir === 'up') return 'back';
  if (dir === 'down') return 'idle';
  return moving && step ? `walk-${dir}` : `side-${dir}`;
}

export interface PoseInput {
  /** while she is being dragged, else null */
  carry: Carry | null;
  /** the walk-cycle frame */
  step: 0 | 1;
  /** the pointer is down on her and has not moved yet */
  pressed: boolean;
  /** she was put down a moment ago */
  dropped: boolean;
  /** what the open chat asks of her */
  chat: ChatMood | null;
  /** the pointer is over her, or she has keyboard focus */
  lively: boolean;
}

/**
 * The one pose to show right now. What is done to her comes first, then what the chat is doing,
 * then idle curiosity.
 */
export function choosePose({ carry, step, pressed, dropped, chat, lively }: PoseInput): Pose {
  if (carry) return carriedPose(carry, step);
  if (pressed) return 'surprised';
  if (dropped) return 'happy';
  if (chat) return chat;
  if (lively) return 'excited';
  return 'idle';
}
