// The Daily's shapes: the API's models (src/api/types.ts), and the unions the screens branch on, read off them so
// they can't drift from the contract.
import type {
  Badge,
  BoardRow,
  CalendarDay,
  DailyCalendar,
  DailyMe,
  DailyToday,
  FoundGroup,
  GameDay,
  GameInfo,
  GroupsView,
  Leaderboard,
  MoveIn,
  NearestGuess,
  NearestView,
  Play,
  PlayOut,
  QuizAnswered,
  QuizQuestion,
  QuizView,
  SearchFound,
  SearchView,
  Streak,
  SudokuView,
  Theme,
  WordRow,
  WordView,
} from '../../api/types';

export type GameId = GameInfo['id'];
export type PlayStatus = Play['status'];
export type BoardPeriod = Leaderboard['period'];
export type SudokuDifficulty = SudokuView['difficulty'];
export type WordMark = WordRow['marks'][number];
export type Move = NonNullable<MoveIn['move']>;

export const GAME_IDS: readonly GameId[] = ['word', 'groups', 'search', 'quiz', 'nearest', 'sudoku'];
export const DIFFICULTIES: readonly SudokuDifficulty[] = ['easy', 'medium', 'hard'];

export const isGameId = (value: string | undefined): value is GameId => GAME_IDS.includes(value as GameId);
export const isDifficulty = (value: string | null | undefined): value is SudokuDifficulty =>
  DIFFICULTIES.includes(value as SudokuDifficulty);
export const isOver = (status: PlayStatus): boolean => status === 'won' || status === 'lost';

export type {
  Badge,
  BoardRow,
  CalendarDay,
  DailyCalendar,
  DailyMe,
  DailyToday,
  FoundGroup,
  GameDay,
  GameInfo,
  GroupsView,
  Leaderboard,
  MoveIn,
  NearestGuess,
  NearestView,
  Play,
  PlayOut,
  QuizAnswered,
  QuizQuestion,
  QuizView,
  SearchFound,
  SearchView,
  Streak,
  SudokuView,
  Theme,
  WordRow,
  WordView,
};
