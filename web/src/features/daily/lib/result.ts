// What a finished play is called and what it came to, for the result card.
import type { GroupsView, Play } from '../types';
import { formatDuration } from './time';
import { praise } from './word';

export interface Result {
  /** 'Brilliant', 'Not this time' */
  headline: string;
  /** 'Solved in 3 guesses', '3 of 4 groups found' */
  summary: string;
  /** the answer, shown when the play was lost and the game has one to give */
  answer: string | null;
  /** a lost guest's play of today's set whose game holds its answers back: they wait for an account, or tomorrow */
  held: boolean;
}

/** What a guest who lost today's puzzle is told instead of the answer. */
export const HELD = 'Sign in to see the answer, or come back tomorrow.';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sameWords = (a: readonly string[], b: readonly string[]) => [...a].sort().join('|') === [...b].sort().join('|');

/** The groups the player found: once the play is over the view lists every group, and the tries tell which. */
export function groupsFound(view: GroupsView): GroupsView['found'] {
  return view.found.filter((g) => view.guesses.some((tried) => sameWords(tried, g.words)));
}

/** The headline, summary and (when lost) the answer of a finished play. `secret`: a guest's play of today's set. */
export function resultOf(play: Play, secret = false): Result {
  const won = play.status === 'won';
  // The Daily Query marks each answer as it's given, so it has nothing left to hold back.
  const held = secret && !won && play.view.kind !== 'quiz';
  return { ...describe(play, won), ...(held ? { held: true, answer: null } : { held: false }) };
}

function describe(play: Play, won: boolean): Omit<Result, 'held'> {
  const view = play.view;
  const time = won && typeof play.seconds === 'number' ? ` in ${formatDuration(play.seconds)}` : '';
  switch (view.kind) {
    case 'word': {
      const n = view.rows.length;
      return won
        ? { headline: praise(n), summary: `Solved in ${plural(n, 'guess', 'guesses')}`, answer: null }
        : {
            headline: 'Not this time',
            summary: view.answer ? 'The word was' : 'Out of guesses',
            answer: view.answer ?? null,
          };
    }
    case 'groups':
      return won
        ? {
            headline: play.mistakes === 0 ? 'Perfect' : 'Solved',
            summary: `All four groups, ${plural(play.mistakes, 'mistake')}${time}`,
            answer: null,
          }
        : { headline: 'Not this time', summary: `${groupsFound(view).length} of 4 groups found`, answer: null };
    case 'search': {
      const total = view.words.length;
      const found = view.found.filter((f) => !f.revealed).length;
      return won
        ? {
            headline: 'Every word found',
            summary: `${plural(total, 'word')}, ${plural(play.hints, 'hint')}${time}`,
            answer: null,
          }
        : { headline: 'Not this time', summary: `${found} of ${total} words found`, answer: null };
    }
    case 'quiz': {
      const right = view.answered.filter((a) => a.correct).length;
      const total = view.questions.length;
      const headline = right === total ? 'Full marks' : won ? 'Well done' : 'Not this time';
      return { headline, summary: `${right} of ${total} right`, answer: null };
    }
    case 'nearest': {
      const guesses = view.guesses.filter((g) => !g.hint).length;
      return won
        ? {
            headline: 'Found it',
            summary: `In ${plural(guesses, 'guess', 'guesses')}, ${plural(play.hints, 'hint')}`,
            answer: null,
          }
        : {
            headline: 'Not this time',
            summary: view.answer ? 'The secret word was' : 'Not found',
            answer: view.answer ?? null,
          };
    }
    case 'sudoku':
      return won
        ? {
            headline: 'Solved',
            summary: `${capital(view.difficulty)}, ${plural(play.mistakes, 'mistake')}, ${plural(play.hints, 'hint')}${time}`,
            answer: null,
          }
        : { headline: 'Not this time', summary: `${capital(view.difficulty)} puzzle, not solved`, answer: null };
  }
}
