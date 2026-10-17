import { describe, expect, it } from 'vitest';
import { dayLabel, monthWeeks, nextToPlay, setNumber, shiftMonth } from './days';
import type { GameDay, GameId, PlayStatus } from '../types';

describe('days', () => {
  it('labels a day, with the year only when it isn’t this year’s', () => {
    expect(dayLabel('2026-10-17', '2026-10-17')).toBe('Saturday 17 October');
    expect(dayLabel('2026-12-31', '2027-01-02')).toBe('Thursday 31 December 2026');
  });

  it('numbers the sets from the first day', () => {
    expect(setNumber('2026-10-01', '2026-10-01')).toBe(1);
    expect(setNumber('2026-10-17', '2026-10-01')).toBe(17);
  });

  it('moves between months across the year’s end', () => {
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('lays a month out in weeks from Sunday', () => {
    const weeks = monthWeeks('2026-10'); // 1 October 2026 is a Thursday
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

describe('nextToPlay', () => {
  const day = (id: GameId, status: PlayStatus) => ({ info: { id }, status }) as GameDay;
  const games = [day('word', 'won'), day('groups', 'new'), day('search', 'lost'), day('quiz', 'playing')];

  it('goes on to the next game not finished, wrapping round', () => {
    expect(nextToPlay(games, 'word')?.info.id).toBe('groups');
    expect(nextToPlay(games, 'groups')?.info.id).toBe('quiz');
    expect(nextToPlay(games, 'quiz')?.info.id).toBe('groups');
  });

  it('is nothing once everything is finished', () => {
    expect(nextToPlay([day('word', 'won'), day('groups', 'lost')], 'word')).toBeNull();
  });
});
