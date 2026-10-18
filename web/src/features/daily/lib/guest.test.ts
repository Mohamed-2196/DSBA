import { describe, expect, it } from 'vitest';
import type { DailyToday, GameDay, GameId } from '../types';
import { withGuestPlays } from './guest';
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

const play = (status: GuestPlay['status']): GuestPlay => ({ revision: 0, moves: [], restarted: false, status });

describe('withGuestPlays', () => {
  it('shows the games a guest finished or started, and counts the finished ones', () => {
    const out = withGuestPlays(today, '2026-10-18', {
      'word:default': play('won'),
      'groups:default': play('playing'),
    });
    expect(out.games.map((g) => g.status)).toEqual(['won', 'playing', 'new']);
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
