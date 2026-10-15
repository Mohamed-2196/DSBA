import type { ComponentType } from 'react';
import {
  ChatText,
  GridFour,
  MagnifyingGlass,
  Question,
  Target,
  SquaresFour,
  type Icon,
} from '@phosphor-icons/react';
import type { GameId, PlayOut } from '../types';
import { SudokuGameView } from './sudoku/SudokuGameView';
import { WordGameView } from './word/WordGameView';
import { GroupsGameView } from './groups/GroupsGameView';
import { SearchGameView } from './search/SearchGameView';
import { QuizGameView } from './quiz/QuizGameView';
import { NearestGameView } from './nearest/NearestGameView';

export interface GamePlugin {
  id: GameId;
  title: string;
  shortTitle: string;
  tagline: string;
  icon: Icon;
  accentColor: string;
  Component: ComponentType<{
    playOut: PlayOut;
    day: string;
    variant: string;
    onVariantChange?: (v: string) => void;
  }>;
}

export const GAME_REGISTRY: Record<GameId, GamePlugin> = {
  word: {
    id: 'word',
    title: 'The Word',
    shortTitle: 'Wordle',
    tagline: 'Find the 5-letter DSBA/finance word in six tries.',
    icon: ChatText,
    accentColor: '#12B886',
    Component: WordGameView,
  },
  groups: {
    id: 'groups',
    title: 'Correlations',
    shortTitle: 'Groups',
    tagline: 'Sort sixteen words into four thematic groups of four.',
    icon: SquaresFour,
    accentColor: '#5865F2',
    Component: GroupsGameView,
  },
  search: {
    id: 'search',
    title: 'Data Mine',
    shortTitle: 'Search',
    tagline: 'Find eight themed words hidden across the letter grid.',
    icon: MagnifyingGlass,
    accentColor: '#F08C00',
    Component: SearchGameView,
  },
  quiz: {
    id: 'quiz',
    title: 'The Daily Query',
    shortTitle: 'Quiz',
    tagline: 'Five quick questions on DSBA, stats, and programme modules.',
    icon: Question,
    accentColor: '#3B82F6',
    Component: QuizGameView,
  },
  nearest: {
    id: 'nearest',
    title: 'Nearest Neighbor',
    shortTitle: 'Nearest',
    tagline: 'Discover the secret word by semantic closeness.',
    icon: Target,
    accentColor: '#EC4899',
    Component: NearestGameView,
  },
  sudoku: {
    id: 'sudoku',
    title: 'Sudoku',
    shortTitle: 'Sudoku',
    tagline: 'Daily 9x9 logic puzzle with Easy, Medium, and Hard tiers.',
    icon: GridFour,
    accentColor: '#0FA3B1',
    Component: SudokuGameView,
  },
};

export function getGamePlugin(id: string): GamePlugin | undefined {
  return GAME_REGISTRY[id as GameId];
}
