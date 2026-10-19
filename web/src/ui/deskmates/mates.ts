import type { MateName, MatePose } from './types';

/** Below this size (px) a deskmate's face no longer reads: the nav icons stand in, and nothing is drawn. */
export const MATE_MIN_SIZE = 32;

/** The app's sections that have a deskmate. */
export type MateSection = 'home' | 'library' | 'modules' | 'notebook' | 'forum' | 'calendar' | 'search';

/** Each section's deskmate. */
export const SECTION_MATE: Record<MateSection, MateName> = {
  home: 'lumen',
  library: 'stacks',
  modules: 'binder',
  notebook: 'jot',
  forum: 'pip-pod',
  calendar: 'blink',
  search: 'loupe',
};

const IDLE: Record<MateName, string> = {
  lumen: 'Lumen, the desk lamp',
  stacks: 'Stacks, the stack of papers',
  binder: 'Binder, the ring binder',
  jot: 'Jot, the spiral notebook',
  'pip-pod': 'Pip and Pod, the forum’s speech bubbles',
  blink: 'Blink, the calendar page',
  loupe: 'Loupe, the magnifying glass',
};

/** The alt text for a deskmate in a pose (docs/design/deskmates/cast-*\/CAST.md). */
export function mateLabel(mate: MateName, pose: MatePose): string {
  const name = IDLE[mate].split(',')[0] ?? mate;
  switch (pose) {
    case 'happy':
      return `${name}, happy`;
    case 'sleepy':
      return `${name}, asleep`;
    case 'wave':
      return 'Lumen waving hello';
    case 'countdown':
      return 'Blink holding up a card';
    case 'searching':
      return 'Searching';
    default:
      return IDLE[mate];
  }
}

/** When a deskmate blinks: every 6 to 11 seconds, starting within the first 4, so two never blink in step. */
export function motionTimings(random: () => number = Math.random): { every: number; delay: number } {
  return { every: Math.round((6 + random() * 5) * 10) / 10, delay: Math.round(random() * 40) / 10 };
}
