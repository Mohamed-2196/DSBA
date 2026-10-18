// Undo and redo for the whole note: one timeline of what the student did, typing and writing by hand together, so
// undo always takes back the last thing done, whichever tool did it.
//   - A 'text' step stands for one step of the text editor's own history (ProseMirror keeps the text itself).
//   - An 'ink' step holds the strokes of each sheet it changed, before and after (a line drawn, a rub of the eraser,
//     a selection moved or deleted, a page moved or deleted), and the number of paper sheets when that changed too.
import type { InkStroke } from '../../lib/ink';

export interface SheetChange {
  sheet: number;
  before: readonly InkStroke[];
  after: readonly InkStroke[];
}

export type Step =
  | { kind: 'text' }
  | { kind: 'ink'; changes: readonly SheetChange[]; paper?: { before: number; after: number } };

export interface Timeline {
  past: readonly Step[];
  future: readonly Step[];
}

/** Steps kept: older ones can't be undone any more. */
export const TIMELINE_LIMIT = 300;

export const emptyTimeline = (): Timeline => ({ past: [], future: [] });

const TEXT: Step = { kind: 'text' };

/** Something new was done: it can be undone, and what was undone before can't be redone any more. */
export function did(t: Timeline, step: Step): Timeline {
  const past = [...t.past, step];
  return { past: past.length > TIMELINE_LIMIT ? past.slice(past.length - TIMELINE_LIMIT) : past, future: [] };
}

/** The step to undo, and the timeline after it. */
export function back(t: Timeline): { timeline: Timeline; step: Step } | null {
  const step = t.past.at(-1);
  if (!step) return null;
  return { timeline: { past: t.past.slice(0, -1), future: [...t.future, step] }, step };
}

/** The step to redo, and the timeline after it. */
export function forward(t: Timeline): { timeline: Timeline; step: Step } | null {
  const step = t.future.at(-1);
  if (!step) return null;
  return { timeline: { past: [...t.past, step], future: t.future.slice(0, -1) }, step };
}

/**
 * The text editor changed its own history without going through this timeline (the keyboard's undo key on a tablet,
 * the browser's Edit menu): `new` a step of typing, `undo` and `redo` one of its steps taken back or done again.
 * The timeline follows, so the next undo here takes back what the student expects.
 */
export function textMoved(t: Timeline, how: 'new' | 'undo' | 'redo'): Timeline {
  if (how === 'new') return did(t, TEXT);
  const [from, to] = how === 'undo' ? [t.past, t.future] : [t.future, t.past];
  const at = from.map((s) => s.kind).lastIndexOf('text');
  const rest = at < 0 ? from : [...from.slice(0, at), ...from.slice(at + 1)];
  const moved = [...to, TEXT];
  return how === 'undo' ? { past: rest, future: moved } : { past: moved, future: rest };
}

/** An ink step for one sheet changed by a gesture. */
export const inkStep = (sheet: number, before: readonly InkStroke[], after: readonly InkStroke[]): Step => ({
  kind: 'ink',
  changes: [{ sheet, before, after }],
});
