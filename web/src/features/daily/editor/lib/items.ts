// The Daily puzzles editor's pure parts: the games it edits, a blank item for each, how a group's words are typed,
// what names an item, and the API's field errors as the forms show them.
import type { ItemOut, QuizData } from '../../../../api/types';

export type ContentGame = ItemOut['game'];
export type ItemData = ItemOut['data'];
export type ItemStatus = 'active' | 'retired' | 'all';

export interface GameInfo {
  id: ContentGame;
  label: string;
  /** what one item is called: 'answer word' */
  noun: string;
  /** what the game takes from a theme, for the panel's lede */
  about: string;
  /** how a pasted list is written, for the import dialog */
  importHint: string;
  /** a pasted example, as the import dialog's placeholder */
  importExample: string;
}

export const GAMES: readonly GameInfo[] = [
  {
    id: 'word',
    label: 'The word',
    noun: 'answer word',
    about: 'One five-letter answer a day. Every answer must be in the guess list, so players can type it.',
    importHint: 'Words separated by new lines, commas or spaces.',
    importExample: 'TREND\nRATIO, CURVE',
  },
  {
    id: 'groups',
    label: 'Groups',
    noun: 'group',
    about:
      'Four groups a day, one at each level from 1 (plainest) to 4 (trickiest), four words each. A word belongs to one group of a theme.',
    importHint: 'Rows with a header: label, level, words. Copy them from a spreadsheet or write them as CSV.',
    importExample: 'label,level,words\nMeasures of centre,1,MEAN MEDIAN MODE MIDRANGE',
  },
  {
    id: 'search',
    label: 'Word search',
    noun: 'word',
    about: 'Eight words a day hidden in a 10 by 10 grid. Words are 4 to 10 letters.',
    importHint: 'Words separated by new lines, commas or spaces.',
    importExample: 'HISTOGRAM\nOUTLIER, SAMPLE',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    noun: 'question',
    about: 'Four questions a day from the theme, then one about the modules. The options are shuffled each day.',
    importHint:
      'Rows with a header: question, answer, wrong 1, wrong 2, wrong 3, explanation, module (a unit code, or empty).',
    importExample:
      'question,answer,wrong 1,wrong 2,wrong 3,explanation,module\nWhich average do outliers move most?,Mean,Median,Mode,Midrange,The mean uses every value.,ST1215',
  },
  {
    id: 'nearest',
    label: 'Nearest neighbour',
    noun: 'secret word',
    about:
      'One secret word a day, found by closeness. A secret word must be in the vocabulary, which decides what is close.',
    importHint: 'Words from the vocabulary, separated by new lines, commas or spaces.',
    importExample: 'mean\nregression',
  },
];

export function gameInfo(game: ContentGame): GameInfo {
  return GAMES.find((g) => g.id === game) ?? GAMES[0];
}

export const LEVELS: readonly { level: number; label: string }[] = [
  { level: 1, label: 'Level 1, plainest' },
  { level: 2, label: 'Level 2' },
  { level: 3, label: 'Level 3' },
  { level: 4, label: 'Level 4, trickiest' },
];

/** A new item of the game, empty. */
export function blankData(game: ContentGame): ItemData {
  switch (game) {
    case 'groups':
      return { game, label: '', level: 1, words: [] };
    case 'quiz':
      return { game, question: '', options: ['', '', '', ''], answer: 0, explanation: '', moduleId: null };
    default:
      return { game, word: '' };
  }
}

/** A group's words as typed: one per line, or separated by commas or spaces; in capitals, each once. */
export function parseWords(text: string): string[] {
  const words = text
    .split(/[\s,;|]+/)
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(words)];
}

/** What names an item in a list or a dialog: its word, its group's name or its question. */
export function titleOf(data: ItemData): string {
  switch (data.game) {
    case 'groups':
      return data.label;
    case 'quiz':
      return data.question;
    default:
      return data.word;
  }
}

/** The right option of a question. */
export function rightOption(data: QuizData): string {
  return data.options[data.answer] ?? '';
}

/** A group's words for its row: 'MEAN, MEDIAN, MODE and MIDRANGE'. */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * The API's message for a form field: errors come keyed by the request's path ('data.word', 'data.groups.level' for a
 * value the schema refused), so a field matches its own name and the game-qualified form of it.
 */
export function fieldError(fields: Record<string, string>, name: string): string | undefined {
  if (fields[name]) return fields[name];
  const [head, ...rest] = name.split('.');
  if (head !== 'data' || rest.length === 0) return undefined;
  const qualified = Object.keys(fields).find((k) => k.startsWith('data.') && k.endsWith(`.${rest.join('.')}`));
  return qualified ? fields[qualified] : undefined;
}

/** Messages for fields the form doesn't show, so nothing the API said is lost. */
export function otherErrors(fields: Record<string, string>, shown: readonly string[]): string[] {
  return Object.entries(fields)
    .filter(([key]) => !shown.some((name) => key === name || (name.startsWith('data.') && key.endsWith(name.slice(4)))))
    .map(([, message]) => message);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a theme has, in a line: '8 answer words · 20 groups · 37 search words · 26 questions · 16 secret words'. */
export function countsLine(counts: Record<ContentGame, number>): string {
  return [
    plural(counts.word, 'answer word', 'answer words'),
    plural(counts.groups, 'group', 'groups'),
    plural(counts.search, 'search word', 'search words'),
    plural(counts.quiz, 'question', 'questions'),
    plural(counts.nearest, 'secret word', 'secret words'),
  ].join(' · ');
}

/** How many days an item ran, and the last: 'Ran on 3 days, last 12 Oct 2026', or 'Not run yet'. */
export function usesLine(uses: number, lastUsed: string | null, format: (day: string) => string): string {
  if (!uses || !lastUsed) return 'Not run yet';
  return `Ran on ${plural(uses, 'day', 'days')}, last ${format(lastUsed)}`;
}

/** A theme's id from its title: 'Exam week!' → 'exam-week'. */
export function themeIdFrom(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '');
  return slug.slice(0, 32).replace(/-+$/, '');
}
