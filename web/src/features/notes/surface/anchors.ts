// Handwriting that moves with the typed text (ST-38). A stroke on the paper goes with the block of text it was
// written beside: its `anchor` names the block (its blockId) and how far the stroke's middle is below that block's top.
// When text or a picture is added above it, the block moves down the paper, and so does the stroke, onto the next
// page when it gets there. A stroke in the gap between two blocks goes with the block below it; one a little below
// the end of the text goes with the end (so a picture put in at the end pushes it down); one far below the text, or
// in the margin above it, keeps its place until the text reaches it.
//
// The anchor is what holds: where a stroke is drawn on its sheet follows from it whenever the pages are laid out
// (relocate), on this device or another, in whichever view the text was typed. A stroke the student draws, moves or
// changes is anchored again where it now is. Pure functions over the strokes and the text's blocks (anchors.test.ts).
import type { InkAnchor, Stroke } from '../../../api/types';
import { moved, strokeBounds } from '../../../lib/ink';
import { PAPER_BASE, SHEET_HEIGHT, TEXT_TOP } from './layout';

/** A block of the typed text on the paper, in units from the top of the paper. */
export interface BlockSpan {
  id: string;
  top: number;
  bottom: number;
}

/** The typed text as it is laid on the paper: its blocks in reading order, and where it ends (units). */
export interface TextLayout {
  blocks: readonly BlockSpan[];
  end: number;
}

/** How far below the end of the text a stroke still goes with it (half a page). */
export const END_REACH = SHEET_HEIGHT / 2;
/** Moves smaller than this (units) are left: rounding, not the text moving. */
const STILL = 0.5;

/** Where a stroke's middle is on the paper (units from its top), for a stroke on paper sheet `sheet`. */
export function middleOnPaper(stroke: Stroke, sheet: number): number {
  const b = strokeBounds(stroke);
  return (sheet - PAPER_BASE) * SHEET_HEIGHT + b.y + b.h / 2;
}

/** The anchor for a stroke whose middle is `y` units down the paper, or null where it keeps its place. */
export function anchorAt(y: number, text: TextLayout): InkAnchor | null {
  if (y < TEXT_TOP) return null;
  for (const b of text.blocks) if (y < b.bottom) return { block: b.id, dy: round(y - b.top) };
  if (y - text.end > END_REACH) return null;
  return { block: null, dy: round(y - text.end) };
}

/** Where the middle of a stroke with this anchor goes (units down the paper), or null when its block is gone. */
export function anchoredAt(anchor: InkAnchor, text: TextLayout): number | null {
  if (anchor.block == null) return text.end + anchor.dy;
  const b = text.blocks.find((x) => x.id === anchor.block);
  return b ? b.top + anchor.dy : null;
}

const round = (v: number): number => Math.round(v * 100) / 100;

const shifted = (s: Stroke, dy: number): Stroke => ({ ...s, points: moved(s, 0, dy).points });

function withAnchor(s: Stroke, anchor: InkAnchor | null): Stroke {
  if (anchor) return { ...s, anchor };
  return unanchored(s);
}

/** The stroke without its anchor: it keeps its place on its page (a page moved takes its ink along). */
export function unanchored(s: Stroke): Stroke {
  if (s.anchor == null) return s;
  const { anchor: _gone, ...rest } = s;
  return rest;
}

const sameAnchor = (a: InkAnchor | null | undefined, b: InkAnchor | null | undefined): boolean =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.block === b.block && a.dy === b.dy);

export interface Relocation {
  /** the paper sheets whose strokes changed, and their strokes now */
  sheets: Map<number, Stroke[]>;
  /** the pages of paper the strokes need (more than the note has: add them, and the strokes go on to them) */
  pages: number;
}

/**
 * The strokes on the paper's `pages` sheets put where their anchors say, given the text as it is laid out now:
 * each moves down (or up) with its block, onto the sheet its middle is now on (the last one while the note has no
 * more), and a stroke without an anchor, or whose block is gone, is anchored where it is.
 */
export function relocate(strokesOf: (sheet: number) => readonly Stroke[], pages: number, text: TextLayout): Relocation {
  const out = new Map<number, Stroke[]>();
  const touched = new Set<number>();
  let needed = pages;
  for (let k = 0; k < pages; k++) {
    const sheet = PAPER_BASE + k;
    for (const s of strokesOf(sheet)) {
      let next = s;
      let y = middleOnPaper(s, sheet);
      const target = s.anchor ? anchoredAt(s.anchor, text) : null;
      if (target === null) {
        const anchor = anchorAt(y, text);
        if (!sameAnchor(anchor, s.anchor)) next = withAnchor(s, anchor);
      } else if (Math.abs(target - y) > STILL) {
        next = shifted(s, target - y);
        y = target;
      }
      const want = Math.max(0, Math.floor(y / SHEET_HEIGHT));
      needed = Math.max(needed, want + 1);
      const to = Math.min(want, pages - 1);
      if (to !== k) next = shifted(next, (k - to) * SHEET_HEIGHT);
      const into = PAPER_BASE + to;
      if (!out.has(into)) out.set(into, []);
      out.get(into)?.push(next);
      if (next !== s || to !== k) {
        touched.add(sheet);
        touched.add(into);
      }
    }
  }
  const sheets = new Map<number, Stroke[]>();
  for (const sheet of touched) sheets.set(sheet, out.get(sheet) ?? []);
  return { sheets, pages: needed };
}

/** The strokes after a change the student made: the ones it made or changed lose their anchor (they are anchored
 *  again where they are now); the others keep theirs. */
export function unanchoredChanges(before: readonly Stroke[], after: readonly Stroke[]): Stroke[] {
  const kept = new Set(before);
  return after.map((s) => (kept.has(s) ? s : withAnchor(s, null)));
}
