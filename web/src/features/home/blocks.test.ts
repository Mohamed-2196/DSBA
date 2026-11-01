import { describe, expect, it } from 'vitest';
import type { SiteDoc } from '../../api/types';
import { readSeed } from '../../testing/seed';
import {
  guestDefault,
  layoutOf,
  offeredBlocks,
  moveBlock,
  normalizeBlocks,
  showBlock,
  withUnavailable,
  type HomeBlock,
} from './blocks';

// The hub's default for a new student, as Site settings start.
const STUDENT_DEFAULT = readSeed<SiteDoc>('site').homeBlocks;

const all = (...blocks: HomeBlock[]) => new Set<HomeBlock>(blocks);

describe('normalizeBlocks', () => {
  it('keeps known blocks once, in order', () => {
    expect(normalizeBlocks(['todo', 'weather', 'coming_up', 'todo', 3])).toEqual(['todo', 'coming_up']);
  });
  it('reads anything else as nothing saved', () => {
    expect(normalizeBlocks(null)).toBeNull();
    expect(normalizeBlocks({ todo: true })).toBeNull();
    expect(normalizeBlocks([])).toEqual([]);
  });
});

describe('layoutOf', () => {
  it('uses the defaults when nothing is saved, limited to what is available', () => {
    const l = layoutOf(null, STUDENT_DEFAULT, all('coming_up', 'daily_question', 'todo', 'newsletter'));
    expect(l.shown).toEqual(['coming_up', 'daily_question']);
    expect(l.hidden).toEqual(['todo', 'newsletter']);
  });
  it('shows the saved blocks in their order and lists the rest as hidden', () => {
    const l = layoutOf(['forum', 'coming_up'], STUDENT_DEFAULT, all('coming_up', 'forum', 'todo', 'noora'));
    expect(l.shown).toEqual(['forum', 'coming_up']);
    expect(l.hidden).toEqual(['todo', 'noora']);
  });
  it('gives guests no account-only blocks by default', () => {
    expect(guestDefault(STUDENT_DEFAULT)).not.toContain('todo');
    expect(guestDefault(['todo', 'help_below', 'forum'])).toEqual(['forum']);
  });
});

describe('moving and showing', () => {
  it('moves a block one place, and not past either end', () => {
    expect(moveBlock(['coming_up', 'todo', 'forum'], 'todo', -1)).toEqual(['todo', 'coming_up', 'forum']);
    expect(moveBlock(['coming_up', 'todo'], 'coming_up', -1)).toEqual(['coming_up', 'todo']);
    expect(moveBlock(['coming_up', 'todo'], 'todo', 1)).toEqual(['coming_up', 'todo']);
  });
  it('shows a block at the end and hides it', () => {
    expect(showBlock(['coming_up'], 'todo', true)).toEqual(['coming_up', 'todo']);
    expect(showBlock(['coming_up', 'todo'], 'coming_up', false)).toEqual(['todo']);
  });
  it('keeps blocks that are unavailable now in their place', () => {
    const saved: HomeBlock[] = ['coming_up', 'todo', 'forum'];
    expect(withUnavailable(['forum', 'coming_up'], saved, STUDENT_DEFAULT, all('coming_up', 'forum'))).toEqual([
      'forum',
      'todo',
      'coming_up',
    ]);
  });
});

describe('offeredBlocks', () => {
  const on =
    (...features: string[]) =>
    (f: string) =>
      features.includes(f);
  it('offers a block only when every feature it needs is on', () => {
    const offered = offeredBlocks(on('calendar', 'library', 'forum'), { signedIn: true, tracking: false });
    expect(offered).not.toContain('daily_question');
    expect(offered).not.toContain('help_below');
    expect(offered).toContain('coming_up');
    expect(offered).toContain('forum');
    // a past question a day needs no calendar: the student can pick its module
    expect(
      offeredBlocks(on('library', 'library.questions', 'library.daily-question'), {
        signedIn: false,
        tracking: false,
      }),
    ).toContain('daily_question');
  });
  it('needs an account for account blocks and lesson progress for Continue', () => {
    const guest = offeredBlocks(on('board', 'forum', 'forum.help-below'), { signedIn: false, tracking: false });
    expect(guest).not.toContain('todo');
    expect(guest).not.toContain('help_below');
    expect(guest).not.toContain('continue');
    expect(offeredBlocks(on(), { signedIn: false, tracking: true })).toContain('continue');
  });
  it('starts clean: results, what to carry on with, the dates ahead and a past question a day', () => {
    expect(STUDENT_DEFAULT).toEqual([
      'results_day',
      'carry_on', // before Up next's countdown, so a phone reaches it (ST-81)
      'coming_up',
      'daily_question',
    ]);
    expect(STUDENT_DEFAULT).not.toContain('daily'); // the Daily games are there to add (ST-50)
  });
});
