// What a stylus asks for beyond its tip, read from Pointer Events fields (https://w3c.github.io/pointerevents/):
//   - the eraser: a pen's eraser end, or a barrel button set to erase, reports button 5 when it is pressed or let go,
//     and bit 32 in `buttons` while it is held (Windows pens and Wacom; other pens may not report it);
//   - hovering: a pen moving above the screen without touching it (Apple Pencil on M2 and later iPads, the S Pen).
import type { PenSettings, Tool } from './tools';

const ERASER_BUTTON = 5;
const ERASER_BIT = 32;
const CONTACT_BIT = 1;
/** The hover dot's smallest radius (units), so the finest pen still shows one. */
const MIN_DOT = 2;

export interface PenButtons {
  pointerType: string;
  button: number;
  buttons: number;
}

/** Whether the pen is held to erase. On a move, `button` only says the eraser changed (pressed or let go), so only
 *  `buttons` counts there. */
export function erasesByButton(e: PenButtons, moving = false): boolean {
  if (e.pointerType !== 'pen') return false;
  if ((e.buttons & ERASER_BIT) !== 0) return true;
  return !moving && e.button === ERASER_BUTTON;
}

/** What a pointer event does to the hover dot. Only a pen moving without touching shows it; the pen touching down or
 *  leaving, a finger touching down and a mouse hide it. A resting palm that shifts leaves it be (no flicker while the
 *  pen hovers). */
export function hoverAfter(e: { type: string; pointerType: string; buttons: number }): 'show' | 'hide' | 'keep' {
  if (e.pointerType === 'touch') return e.type === 'pointerdown' ? 'hide' : 'keep';
  return e.type === 'pointermove' && e.pointerType === 'pen' && (e.buttons & CONTACT_BIT) === 0 ? 'show' : 'hide';
}

export type HoverDot = { kind: 'ink' | 'highlighter'; r: number; color: string } | { kind: 'eraser'; r: number };

/** The dot under a hovering pen: where it will land, with what it will do there. Null when touching would do nothing
 *  that a dot can show. */
export function hoverDot(tool: Tool, pens: PenSettings, eraserHeld: boolean, readOnly: boolean): HoverDot | null {
  if (readOnly) return null;
  if (eraserHeld || tool === 'eraser') return { kind: 'eraser', r: pens.eraser.size / 2 };
  if (tool === 'pen' || tool === 'type')
    return { kind: 'ink', r: Math.max(MIN_DOT, pens.pen.width / 2), color: pens.pen.color };
  if (tool === 'highlighter')
    return { kind: 'highlighter', r: Math.max(MIN_DOT, pens.highlighter.width / 2), color: pens.highlighter.color };
  return null;
}
