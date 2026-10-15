import { describe, expect, it } from 'vitest';
import { GAME_REGISTRY, getGamePlugin } from './games/registry';
import { formatCountdown } from './lib/time';
import { getGuestHistory } from './api';

describe('daily feature', () => {
  describe('games registry', () => {
    it('registers all 6 games with valid metadata', () => {
      const expectedGames = ['word', 'groups', 'search', 'quiz', 'nearest', 'sudoku'];
      for (const id of expectedGames) {
        const plugin = getGamePlugin(id);
        expect(plugin).toBeDefined();
        expect(plugin?.id).toBe(id);
        expect(plugin?.title).toBeTruthy();
        expect(plugin?.tagline).toBeTruthy();
        expect(plugin?.icon).toBeDefined();
        expect(plugin?.Component).toBeDefined();
      }
    });

    it('returns undefined for unknown game ids', () => {
      expect(getGamePlugin('chess')).toBeUndefined();
      expect(getGamePlugin('')).toBeUndefined();
    });

    it('has 6 games in GAME_REGISTRY', () => {
      expect(Object.keys(GAME_REGISTRY)).toHaveLength(6);
    });
  });

  describe('countdown formatting', () => {
    it('formats remaining hours, minutes, and seconds', () => {
      // 2 hours, 30 minutes, 15 seconds in future
      const target = new Date(Date.now() + (2 * 3600 + 30 * 60 + 15) * 1000).toISOString();
      const formatted = formatCountdown(target);
      expect(formatted).toMatch(/^02:30:1[45]$/);
    });

    it('returns 00:00:00 when time has passed', () => {
      const past = new Date(Date.now() - 5000).toISOString();
      expect(formatCountdown(past)).toBe('00:00:00');
    });
  });

  describe('guest history storage', () => {
    it('returns empty array when nothing is stored', () => {
      const moves = getGuestHistory('2026-10-15', 'word');
      expect(moves).toEqual([]);
    });
  });
});
