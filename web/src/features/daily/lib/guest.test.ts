import { describe, expect, it } from 'vitest';
import type { DailyToday, GameDay, GameId, PlayOut } from '../types';
import { settledGuestPlay, withGuestPlays } from './guest';
import type { GuestPlay } from './storage';

const game = (id: GameId, variants: string[] = ['']) =>
  ({ info: { id, variants }, status: 'new', variant: '', points: 0, scored: false }) as unknown as GameDay;

const today = {
  day: '2026-10-18',
  games: [game('word'), game('groups'), game('sudoku', ['easy', 'medium', 'hard'])],
  done: 0,
  points: 0,
  streak: null,
} as unknown as DailyToday;

const play = (status: GuestPlay['status']): GuestPlay => ({
  revision: 0,
  moves: [],
  restarted: false,
  status,
  picture: status === 'won' ? [['hit']] : null,
});

describe('withGuestPlays', () => {
  it('shows the games a guest finished or started, and counts the finished ones', () => {
    const out = withGuestPlays(today, '2026-10-18', {
      'word:default': play('won'),
      'groups:default': play('playing'),
    });
    expect(out.games.map((g) => g.status)).toEqual(['won', 'playing', 'new']);
    expect(out.games[0]?.picture).toEqual([['hit']]);
    expect(out.done).toBe(1);
  });

  it('opens the Sudoku difficulty the guest got furthest with', () => {
    const out = withGuestPlays(today, '2026-10-18', {
      'sudoku:easy': play('playing'),
      'sudoku:hard': play('won'),
    });
    const sudoku = out.games[2];
    expect([sudoku?.status, sudoku?.variant]).toEqual(['won', 'hard']);
  });

  it('leaves the set as it is on another day, or with no plays', () => {
    expect(withGuestPlays(today, '2026-10-17', { 'word:default': play('won') })).toBe(today);
    expect(withGuestPlays(today, '2026-10-18', {}).games).toEqual(today.games);
  });
});

describe('settledGuestPlay', () => {
  const out = (status: PlayOut['play']['status'], revision: number, restarted = false) =>
    ({ play: { status, revision, restarted, picture: status === 'won' ? [['hit']] : null } }) as PlayOut;
  const kept = (revision: number, restarted = false): GuestPlay => ({
    revision,
    moves: [{ kind: 'give-up' }],
    restarted,
    status: 'playing',
    picture: null,
  });

  it('forgets the moves of a play a fix started again, and says why', () => {
    const { out: shown, keep } = settledGuestPlay(kept(0), out('new', 1, true));
    expect(shown.play.restarted).toBe(true);
    expect(keep).toEqual({ revision: 1, moves: [], restarted: true, status: 'new', picture: null });
  });

  it('keeps saying why until the next move', () => {
    expect(settledGuestPlay({ ...kept(1, true), moves: [] }, out('new', 1)).out.play.restarted).toBe(true);
    expect(settledGuestPlay(kept(1, true), out('playing', 1)).out.play.restarted).toBe(false);
  });

  it('leaves a play that finished on the version a fix replaced as it is, keeping its picture', () => {
    const finished = out('won', 0);
    const { out: shown, keep } = settledGuestPlay(kept(0), finished);
    expect(shown).toBe(finished);
    expect(keep?.picture).toEqual([['hit']]);
    expect(settledGuestPlay({ ...kept(0), status: 'won', picture: [['hit']] }, finished).keep).toBeNull();
  });
});
