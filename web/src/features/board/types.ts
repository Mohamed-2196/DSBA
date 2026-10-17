// Shapes the board's components share.
import type { BoardCard } from '../../api/types';
import type { Scores } from './scores';

/** Where focus goes once a move has redrawn the board: back to the moved card (its title or its menu button) once it
 *  shows where it went (that column, after the card `prevId`), or to a column when the card left the one on a phone's
 *  screen. Older requests are
 *  ignored, so a card that shows up later (a filter cleared) doesn't take focus out of the blue. */
export type FocusRequest = { at: number } & (
  | { kind: 'card'; cardId: string; columnId: string; prevId: string | null; part: 'title' | 'menu' }
  | { kind: 'column'; columnId: string }
);

/** The column whose "Add a card" form is open; `at` opens it afresh (and focuses it) when asked again. */
export interface Adding {
  columnId: string;
  at: number;
}

/** How long a focus request waits for its card or column to be drawn. */
export const FOCUS_WAIT_MS = 2000;

/** What a card on the board can do. */
export interface CardActions {
  readOnly: boolean;
  scores: Scores;
  onScore: (card: BoardCard) => void;
  onOpen: (card: BoardCard) => void;
  onDelete: (card: BoardCard) => void;
  /** to the top of another column; `part` is what had focus */
  onMove: (card: BoardCard, columnId: string, part: 'title' | 'menu') => void;
  onNudge: (card: BoardCard, by: -1 | 1, part: 'title' | 'menu') => void;
  canNudge: (card: BoardCard, by: -1 | 1) => boolean;
  /** Alt+Left and Alt+Right: to the top of the column before or after */
  onStep: (card: BoardCard, by: -1 | 1, part: 'title' | 'menu') => void;
  dragging: string | null;
  onDragStart: (card: BoardCard) => void;
  onDragEnd: () => void;
  focus: FocusRequest | null;
  onFocused: () => void;
}
