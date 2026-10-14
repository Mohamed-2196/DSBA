// Undo and redo for ink: each change is one sheet's strokes before and after a gesture (a line drawn, a rub of
// the eraser, a selection moved or deleted).
import type { InkStroke } from './geometry';

export interface InkChange {
  sheet: number;
  before: readonly InkStroke[];
  after: readonly InkStroke[];
}

export const HISTORY_LIMIT = 200;

export interface InkHistory {
  past: InkChange[];
  future: InkChange[];
}

export const emptyHistory = (): InkHistory => ({ past: [], future: [] });

/** A new change: it can be undone, and what was undone before can't be redone any more. */
export function record(h: InkHistory, change: InkChange): InkHistory {
  const past = [...h.past, change];
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, future: [] };
}

/** The last change undone: the sheet and the strokes to put back, and the history after it. */
export function undo(h: InkHistory): { history: InkHistory; sheet: number; strokes: readonly InkStroke[] } | null {
  const change = h.past.at(-1);
  if (!change) return null;
  return { history: { past: h.past.slice(0, -1), future: [...h.future, change] }, sheet: change.sheet, strokes: change.before };
}

/** The last undone change done again. */
export function redo(h: InkHistory): { history: InkHistory; sheet: number; strokes: readonly InkStroke[] } | null {
  const change = h.future.at(-1);
  if (!change) return null;
  return { history: { past: [...h.past, change], future: h.future.slice(0, -1) }, sheet: change.sheet, strokes: change.after };
}
