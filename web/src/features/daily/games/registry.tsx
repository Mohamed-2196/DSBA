// Each game's screen. A game is a component that draws its play and sends moves through `play`; the page around
// it (DailyGamePage) owns the bar, the rules, the result and the messages. Names, taglines, rules and scoring come
// from the API (GameInfo), so the hub, the game and the share text always agree.
import type { ComponentType } from 'react';
import type { ApiErrorCode } from '../../../api/errors';
import type { FlashTone } from '../components/Flash';
import type { GameId, Move, PlayOut } from '../types';
import { GroupsExample, GroupsGame } from './groups/GroupsGame';
import { NearestExample, NearestGame } from './nearest/NearestGame';
import { QuizExample, QuizGame } from './quiz/QuizGame';
import { SearchExample, SearchGame } from './search/SearchGame';
import { SudokuExample, SudokuGame } from './sudoku/SudokuGame';
import { WordExample, WordGame } from './word/WordGame';

export type MoveResult =
  | { ok: true; out: PlayOut }
  | { ok: false; code: ApiErrorCode | null; message: string };

export interface GameProps {
  out: PlayOut;
  /** a move is on its way to the server */
  busy: boolean;
  /** sends a move; resolves with the play after it, or with why it didn't count (nothing changed then) */
  play: (move: Move) => Promise<MoveResult>;
  /** a short message over the board */
  flash: (text: string, tone?: FlashTone) => void;
  /** a dialog is open: keyboard shortcuts wait */
  paused: boolean;
  /** opens the result card now (for games that don't open it themselves) */
  showResult: () => void;
  /** Sudoku: switch difficulty */
  onVariant: (variant: string) => void;
}

export interface GamePlugin {
  Component: ComponentType<GameProps>;
  /** the worked example in the rules */
  Example: ComponentType;
  /** keyboard shortcuts, for the rules on a computer */
  keys: readonly (readonly [string, string])[];
  /** ms after the finishing move before the result opens itself (its animation first); null: the game asks */
  resultDelay: number | null;
}

export const GAMES: Record<GameId, GamePlugin> = {
  word: {
    Component: WordGame,
    Example: WordExample,
    keys: [
      ['A–Z', 'Type a letter'],
      ['Enter', 'Guess'],
      ['Backspace', 'Delete a letter'],
    ],
    resultDelay: 2200,
  },
  groups: {
    Component: GroupsGame,
    Example: GroupsExample,
    keys: [],
    resultDelay: 1400,
  },
  search: {
    Component: SearchGame,
    Example: SearchExample,
    keys: [
      ['Arrow keys', 'Move between letters'],
      ['Enter', 'Pick a first or last letter'],
      ['Esc', 'Start the line again'],
    ],
    resultDelay: 1100,
  },
  quiz: {
    Component: QuizGame,
    Example: QuizExample,
    keys: [
      ['1–4', 'Pick an answer'],
      ['Enter', 'Next question'],
    ],
    resultDelay: null,
  },
  nearest: {
    Component: NearestGame,
    Example: NearestExample,
    keys: [['Enter', 'Guess']],
    resultDelay: 1300,
  },
  sudoku: {
    Component: SudokuGame,
    Example: SudokuExample,
    keys: [
      ['1–9', 'Place a digit (or a note)'],
      ['Arrow keys', 'Move between cells'],
      ['N', 'Notes on or off'],
      ['Backspace', 'Clear the cell’s notes'],
      ['Ctrl+Z', 'Undo a note'],
    ],
    resultDelay: 1200,
  },
};
