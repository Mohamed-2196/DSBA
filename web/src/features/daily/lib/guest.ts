// A guest's plays. The server keeps nothing for guests: their device keeps the moves (and a finished play's picture)
// and sends the moves each time.
// - On the hub and Home, today's set comes back with every game new, so the plays this device keeps are laid over it:
//   each game's furthest status, the Sudoku difficulty to open, and how many are done.
// - On signing in, the plays are kept on the account (one each, the furthest first: a finished Sudoku is the
//   difficulty that counts), and the device forgets them.
// - When an editor fixed today's puzzle, moves made on the version it replaced come back finished as they were, or
//   started again on the fixed puzzle: then the device forgets them, and remembers to say why until the next move.
import type { DailyToday, GameId, PlayOut, PlayStatus } from '../types';
import { guestSlot, slotOf, type GuestPlay, type GuestPlays } from './storage';

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
    return { ...game, status: lead.play.status, variant: lead.variant, picture: lead.play.picture };
  });
  return { ...today, games, done: games.filter((g) => g.status === 'won' || g.status === 'lost').length };
}

/**
 * A guest's play as the server replayed it, and what this device keeps from now on (null: what it keeps stands). A
 * play a fix started again forgets its moves and says why until the next move.
 */
export function settledGuestPlay(kept: GuestPlay, out: PlayOut): { out: PlayOut; keep: GuestPlay | null } {
  if (out.play.restarted) {
    return { out, keep: { revision: out.play.revision, moves: [], restarted: true, status: 'new', picture: null } };
  }
  const restarted = kept.restarted && out.play.status === 'new';
  const shown = restarted ? { ...out, play: { ...out.play, restarted: true } } : out;
  // A finished play kept without its picture gets it, for the hub's tile.
  const keep =
    out.play.picture && !kept.picture ? { ...kept, status: out.play.status, picture: out.play.picture } : null;
  return { out: shown, keep };
}

export interface PlayToKeep {
  slot: string;
  game: GameId;
  variant: string;
  play: GuestPlay;
}

/** A day's guest plays to keep on an account: those with moves, the furthest first (won, lost, then playing). */
export function playsToKeep(plays: GuestPlays): PlayToKeep[] {
  return Object.entries(plays)
    .flatMap(([slot, play]) => {
      const where = slotOf(slot);
      return where && play.moves.length ? [{ slot, ...where, play }] : [];
    })
    .sort((a, b) => RANK[b.play.status] - RANK[a.play.status]);
}
