import { describe, expect, it } from 'vitest';
import { clockStart } from './papers';
import { TIME_ME_KEY, cleanTimer, timedPaperPath } from './timeMe';

const paper = { id: 'p1', slug: 'st2134-may-2025', title: 'ST2134 · May 2025 · Zone A', moduleId: 'st2134' };

describe('the paper being timed', () => {
  it('is personal, so it goes on sign-out', () => {
    expect(TIME_ME_KEY.startsWith('hub.mine.')).toBe(true);
  });

  it('reads back what was stored', () => {
    const clock = clockStart(2 * 3600_000, 1000);
    expect(cleanTimer({ paper, clock }, 2000)).toEqual({ paper, clock });
    expect(cleanTimer({ paper: { ...paper, moduleId: null }, clock }, 2000)?.paper.moduleId).toBeNull();
  });

  it('throws out anything else', () => {
    const clock = clockStart(2 * 3600_000, 1000);
    expect(cleanTimer(null, 0)).toBeNull();
    expect(cleanTimer({ clock }, 0)).toBeNull();
    expect(cleanTimer({ paper: { ...paper, slug: '' }, clock }, 0)).toBeNull();
    expect(cleanTimer({ paper: { ...paper, moduleId: 3 }, clock }, 0)).toBeNull();
    expect(cleanTimer({ paper, clock: { total: 5 } }, 0)).toBeNull();
    // ran out more than six hours ago
    expect(cleanTimer({ paper, clock }, 1000 + 2 * 3600_000 + 7 * 3600_000)).toBeNull();
  });

  it('links back to the paper', () => {
    expect(timedPaperPath(paper)).toBe('/library/st2134-may-2025');
  });
});
