// How a game stands on the hub and Home: where its card leads, and what it says.
import type { GameDay } from '../types';

export type Tone = 'new' | 'playing' | 'won' | 'lost';

/** The game's page, opening the difficulty already started (Sudoku). */
export function gameLink(game: GameDay): string {
  return game.variant ? `/daily/${game.info.id}?difficulty=${game.variant}` : `/daily/${game.info.id}`;
}

/** The card's status line, the word on its button, and its tone. */
export function statusOf(game: GameDay): { label: string; action: string; tone: Tone } {
  switch (game.status) {
    case 'won':
      return { label: game.scored ? `Solved · ${game.points} points` : 'Solved', action: 'See result', tone: 'won' };
    case 'lost':
      return {
        label: game.scored && game.points ? `Done · ${game.points} points` : 'Done',
        action: 'See result',
        tone: 'lost',
      };
    case 'playing':
      return { label: 'In progress', action: 'Continue', tone: 'playing' };
    default:
      return { label: `Up to ${game.info.maxPoints} points`, action: 'Play', tone: 'new' };
  }
}
