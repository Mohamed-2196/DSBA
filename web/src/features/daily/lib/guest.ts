// A guest's plays. The server keeps nothing for guests: their device keeps the moves and sends them each time.
// - On the hub and Home, today's set comes back with every game new, so the plays this device keeps are laid over it:
//   each game's furthest status, the Sudoku difficulty to open, and how many are done.
// - When an editor fixed today's puzzle, moves made on the version it replaced come back finished as they were, or
//   started again on the fixed puzzle: then the device forgets them, and remembers to say why until the next move.
import type { DailyToday, PlayOut, PlayStatus } from '../types';
import { guestSlot, type GuestPlay, type GuestPlays } from './storage';

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

/**
 * A guest's play as the server replayed it, and what this device keeps from now on (null: what it keeps stands). A
 * play a fix started again forgets its moves and says why until the next move.
 */
export function settledGuestPlay(kept: GuestPlay, out: PlayOut): { out: PlayOut; keep: GuestPlay | null } {
  if (out.play.restarted) {
    return { out, keep: { revision: out.play.revision, moves: [], restarted: true, status: 'new' } };
  }
  const restarted = kept.restarted && out.play.status === 'new';
  return { out: restarted ? { ...out, play: { ...out.play, restarted: true } } : out, keep: null };
}
