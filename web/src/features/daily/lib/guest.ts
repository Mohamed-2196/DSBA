// A guest's plays on the hub and Home. The server keeps nothing for guests, so today's set comes back with every game
// new; the plays this device keeps are laid over it: each game's furthest status, the Sudoku difficulty to open, and
// how many are done.
import type { DailyToday, PlayStatus } from '../types';
import { guestSlot, type GuestPlays } from './storage';

const RANK: Record<PlayStatus, number> = { new: 0, playing: 1, lost: 2, won: 3 };

/** Today's set with the guest's plays of `day` laid over it (as it is when `day` isn't the set's day). */
export function withGuestPlays(today: DailyToday, day: string, plays: GuestPlays): DailyToday {
  if (today.day !== day) return today;
  const games = today.games.map((game) => {
    const mine = game.info.variants
      .map((variant) => ({ variant, play: plays[guestSlot(game.info.id, variant)] }))
      .filter((p): p is { variant: string; play: NonNullable<typeof p.play> } => p.play !== undefined);
    const lead = mine.reduce<(typeof mine)[number] | null>(
      (best, p) => (best && RANK[best.play.status] >= RANK[p.play.status] ? best : p),
      null,
    );
    if (!lead || lead.play.status === 'new') return game;
    return { ...game, status: lead.play.status, variant: lead.variant };
  });
  return { ...today, games, done: games.filter((g) => g.status === 'won' || g.status === 'lost').length };
}
