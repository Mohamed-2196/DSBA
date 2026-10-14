// Home's blocks: which there are, the default layout, and the rules for showing, hiding and moving them. Pure, so
// they can be tested. The layout is saved as the list of blocks shown, in order (the account's homeBlocks, or this
// browser's for a guest); null means the default.
import type { Me } from '../../api/types';

export type HomeBlock = NonNullable<Me['preferences']['homeBlocks']>[number];

export interface BlockInfo {
  title: string;
  /** what it shows, for Customize Home */
  description: string;
}

export const BLOCKS: Readonly<Record<HomeBlock, BlockInfo>> = {
  start_here: { title: 'Start here', description: 'Year 1’s checklist in the first weeks.' },
  results_day: { title: 'Results day', description: 'What to do in the two weeks after results.' },
  coming_up: { title: 'Coming up', description: 'Your next exam and the dates ahead.' },
  daily_question: { title: 'Daily question', description: 'A past exam question before your next exam.' },
  todo: { title: 'My to-do', description: 'What’s to do and in progress on your study board.' },
  continue: { title: 'Continue', description: 'The lessons to pick up. Needs lesson progress on.' },
  modules: { title: 'My modules', description: 'Your modules, with their next exams.' },
  new: { title: 'New in my modules', description: 'New files and active threads.' },
  help_below: { title: 'Help the years below', description: 'Questions from Years 1 and 2 that need an answer.' },
  newsletter: { title: 'The DSBA Newsletter', description: 'The latest issue.' },
};

export const ALL_BLOCKS = Object.keys(BLOCKS) as HomeBlock[];

/** A signed-in student's Home before they change it: what's coming, what to do, then where they study. */
export const STUDENT_DEFAULT: readonly HomeBlock[] = [
  'start_here',
  'results_day',
  'coming_up',
  'daily_question',
  'todo',
  'continue',
  'modules',
  'new',
  'help_below',
  'newsletter',
];

/** A guest's: fewer blocks, nothing that needs an account. */
export const GUEST_DEFAULT: readonly HomeBlock[] = ['start_here', 'results_day', 'coming_up', 'continue', 'modules', 'new', 'newsletter'];

const isBlock = (x: unknown): x is HomeBlock => typeof x === 'string' && Object.prototype.hasOwnProperty.call(BLOCKS, x);

/** A layout read from storage: known blocks once each, in order; null when there is none (or it isn't a list). */
export function normalizeBlocks(raw: unknown): HomeBlock[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter(isBlock))];
}

export interface Layout {
  /** shown, in order */
  shown: HomeBlock[];
  /** hidden, in the default order */
  hidden: HomeBlock[];
}

/** The layout of the `available` blocks: the saved one, or `defaults` when nothing is saved. */
export function layoutOf(saved: readonly HomeBlock[] | null, defaults: readonly HomeBlock[], available: ReadonlySet<HomeBlock>): Layout {
  const order = saved ?? defaults;
  const shown = order.filter((b) => available.has(b));
  const hidden = ALL_BLOCKS.filter((b) => available.has(b) && !shown.includes(b));
  return { shown, hidden };
}

/** `shown` with `block` moved one place up (-1) or down (1) among the shown blocks. */
export function moveBlock(shown: readonly HomeBlock[], block: HomeBlock, by: -1 | 1): HomeBlock[] {
  const i = shown.indexOf(block);
  const j = i + by;
  if (i < 0 || j < 0 || j >= shown.length) return [...shown];
  const next = [...shown];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** `shown` with `block` shown (at the end) or hidden. */
export function showBlock(shown: readonly HomeBlock[], block: HomeBlock, on: boolean): HomeBlock[] {
  const rest = shown.filter((b) => b !== block);
  return on ? [...rest, block] : rest;
}

/**
 * The list to save after a change to the visible blocks: the blocks not available now (a feature switched off, a
 * guest's view) keep their place, so switching a feature back on brings them back where they were.
 */
export function withUnavailable(next: readonly HomeBlock[], saved: readonly HomeBlock[] | null, defaults: readonly HomeBlock[], available: ReadonlySet<HomeBlock>): HomeBlock[] {
  const before = saved ?? defaults;
  const out = [...next];
  before.forEach((b, i) => {
    if (available.has(b) || out.includes(b)) return;
    out.splice(Math.min(i, out.length), 0, b);
  });
  return out;
}
