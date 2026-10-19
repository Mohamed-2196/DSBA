// How a game stands on the hub and Home: where its tile leads, and the state it shows.
import type { GameDay } from '../types';

export type Tone = 'new' | 'playing' | 'won' | 'lost';

/** The game's page, opening the difficulty already started (Sudoku). */
export function gameLink(game: GameDay): string {
  return game.variant ? `/daily/${game.info.id}?difficulty=${game.variant}` : `/daily/${game.info.id}`;
}

/** The game's state in a word or two ('New', 'Playing', 'Solved · +80', 'Not solved'), and its tone. */
export function statusOf(game: GameDay): { label: string; tone: Tone } {
  const earned = game.scored && game.points > 0 ? ` · +${game.points}` : '';
  switch (game.status) {
    case 'won':
      return { label: `Solved${earned}`, tone: 'won' };
    case 'lost':
      return { label: earned ? `Done${earned}` : 'Not solved', tone: 'lost' };
    case 'playing':
      return { label: 'Playing', tone: 'playing' };
    default:
      return { label: 'New', tone: 'new' };
  }
}
