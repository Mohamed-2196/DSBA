// Undo and redo for the whole note: one timeline of what the student did, typing, writing by hand and placing pictures
// together, so undo always takes back the last thing done, whichever tool did it.
//   - A 'text' step stands for one step of the text editor's own history (ProseMirror keeps the text itself), and the
//     free pictures that changed with it (a picture put in line, or made free, is one step).
//   - A 'page' step holds what changed on the pages outside the text: the strokes of each sheet it changed, before and
//     after (a line drawn, a rub of the eraser, a selection moved or deleted, a page cleared), the number of paper
//     sheets, and the free pictures (moved, resized, turned, cropped, added, deleted).
//   - A 'pages' step is a page of paper added, deleted or moved: a change the server makes at once (pages.ts), taken
//     back by the opposite change, and for a page deleted, by putting its handwriting and pictures back.
import type { InkStroke } from '../../lib/ink';
import type { PageMove } from './pages';
import type { FreePicture } from './pictures/geometry';

export interface SheetChange {
  sheet: number;
  before: readonly InkStroke[];
  after: readonly InkStroke[];
}

export interface PictureChange {
  before: readonly FreePicture[];
  after: readonly FreePicture[];
}

export type Step =
  | { kind: 'text'; pictures?: PictureChange }
  | {
      kind: 'page';
      ink: readonly SheetChange[];
      paper?: { before: number; after: number };
      pictures?: PictureChange;
    }
  | {
      kind: 'pages';
      change: PageMove;
      /** a deleted page's handwriting, and the free pictures before it went */
      restore?: { strokes: readonly InkStroke[]; pictures: readonly FreePicture[] };
    };

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
 * The timeline follows, so the next undo here takes back what the student expects. `moved` is the step that went from
 * one side to the other (the pictures that changed with it change back too).
 */
export function textMoved(t: Timeline, how: 'new' | 'undo' | 'redo'): { timeline: Timeline; moved: Step | null } {
  if (how === 'new') return { timeline: did(t, TEXT), moved: null };
  const [from, to] = how === 'undo' ? [t.past, t.future] : [t.future, t.past];
  const at = from.map((s) => s.kind).lastIndexOf('text');
  const moved = at < 0 ? TEXT : from[at];
  const rest = at < 0 ? from : [...from.slice(0, at), ...from.slice(at + 1)];
  const timeline = how === 'undo' ? { past: rest, future: [...to, moved] } : { past: [...to, moved], future: rest };
  return { timeline, moved: at < 0 ? null : moved };
}

/** Taking `step` back (`undo`) or doing it again (`redo`) didn't work: it goes back where it was. */
export function restored(t: Timeline, step: Step, how: 'undo' | 'redo'): Timeline {
  if (how === 'undo') return { past: [...t.past, step], future: t.future.filter((s) => s !== step) };
  return { past: t.past.filter((s) => s !== step), future: [...t.future, step] };
}

/** The last step done was the text editor's, and the free pictures changed with it: one step to undo. */
export function withPictures(t: Timeline, pictures: PictureChange): Timeline {
  const last = t.past.at(-1);
  if (last?.kind !== 'text') return t;
  return { past: [...t.past.slice(0, -1), { kind: 'text', pictures }], future: t.future };
}

/** A page step for one sheet's strokes changed by a gesture. */
export const inkStep = (sheet: number, before: readonly InkStroke[], after: readonly InkStroke[]): Step => ({
  kind: 'page',
  ink: [{ sheet, before, after }],
});

/** A page step for the free pictures changed. */
export const picturesStep = (before: readonly FreePicture[], after: readonly FreePicture[]): Step => ({
  kind: 'page',
  ink: [],
  pictures: { before, after },
});
