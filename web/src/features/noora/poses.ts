// Which sprite she shows. Pure functions of what is happening to her (see public/noora for the sprites).
import type { Pose } from './sprites';

export type Heading = 'left' | 'right' | 'up' | 'down';

/**
 * What the chat asks of her:
 *   wave      saying hello as it opens
 *   thinking  working on an answer
 *   talking   the answer is coming in
 *   happy     she has answered
 *   sad       she couldn't help
 */
export type ChatMood = 'wave' | 'thinking' | 'talking' | 'happy' | 'sad';

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
 * Her sprite while she is carried. Sideways she walks: two frames, 'walk' and 'side', swapped by `step` while the
 * hand keeps moving; held still she stands side-on. Carried up she shows her back, carried down she faces you.
 */
function carriedPose({ dir, moving }: Carry, step: 0 | 1): Pose {
  if (dir === 'up') return 'back';
  if (dir === 'down') return 'idle';
  return moving && step ? `walk-${dir}` : `side-${dir}`;
}

const MOOD_POSE: Record<ChatMood, Pose> = { wave: 'talking', thinking: 'surprised', talking: 'talking', happy: 'happy', sad: 'sad' };

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
  /** the pointer is over her, or she has keyboard focus: she waves */
  lively: boolean;
}

/** The one pose to show right now. What is done to her comes first, then what the chat is doing, then a wave. */
export function choosePose({ carry, step, pressed, dropped, chat, lively }: PoseInput): Pose {
  if (carry) return carriedPose(carry, step);
  if (pressed) return 'surprised';
  if (dropped) return 'happy';
  if (chat) return MOOD_POSE[chat];
  if (lively) return 'talking';
  return 'idle';
}

/** The motion that goes with a pose at rest (Mascot.css): a wave, a thoughtful sway, or breathing. */
export function motionFor({ chat, lively }: Pick<PoseInput, 'chat' | 'lively'>): 'wave' | 'think' | 'breathe' {
  if (chat === 'thinking') return 'think';
  if (chat === 'wave' || (!chat && lively)) return 'wave';
  return 'breathe';
}
