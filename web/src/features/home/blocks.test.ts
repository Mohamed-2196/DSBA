import { describe, expect, it } from 'vitest';
import { GUEST_DEFAULT, STUDENT_DEFAULT, layoutOf, offeredBlocks, moveBlock, normalizeBlocks, showBlock, withUnavailable, type HomeBlock } from './blocks';

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
    const l = layoutOf(null, STUDENT_DEFAULT, all('coming_up', 'modules', 'todo', 'newsletter'));
    expect(l.shown).toEqual(['coming_up', 'todo', 'modules']);
    expect(l.hidden).toEqual(['newsletter']);
  });
  it('shows the saved blocks in their order and lists the rest as hidden', () => {
    const l = layoutOf(['modules', 'coming_up'], STUDENT_DEFAULT, all('coming_up', 'modules', 'todo', 'files'));
    expect(l.shown).toEqual(['modules', 'coming_up']);
    expect(l.hidden).toEqual(['todo', 'files']);
  });
  it('gives guests no account-only blocks by default', () => {
    expect(GUEST_DEFAULT).not.toContain('todo');
    expect(GUEST_DEFAULT).not.toContain('help_below');
  });
});

describe('moving and showing', () => {
  it('moves a block one place, and not past either end', () => {
    expect(moveBlock(['coming_up', 'todo', 'modules'], 'todo', -1)).toEqual(['todo', 'coming_up', 'modules']);
    expect(moveBlock(['coming_up', 'todo'], 'coming_up', -1)).toEqual(['coming_up', 'todo']);
    expect(moveBlock(['coming_up', 'todo'], 'todo', 1)).toEqual(['coming_up', 'todo']);
  });
  it('shows a block at the end and hides it', () => {
    expect(showBlock(['coming_up'], 'todo', true)).toEqual(['coming_up', 'todo']);
    expect(showBlock(['coming_up', 'todo'], 'coming_up', false)).toEqual(['todo']);
  });
  it('keeps blocks that are unavailable now in their place', () => {
    const saved: HomeBlock[] = ['coming_up', 'todo', 'modules'];
    expect(withUnavailable(['modules', 'coming_up'], saved, STUDENT_DEFAULT, all('coming_up', 'modules'))).toEqual(['modules', 'todo', 'coming_up']);
  });
});

describe('offeredBlocks', () => {
  const on = (...features: string[]) => (f: string) => features.includes(f);
  it('offers a block only when every feature it needs is on', () => {
    const offered = offeredBlocks(on('calendar', 'library', 'forum'), { signedIn: true, tracking: false });
    expect(offered).not.toContain('daily_question');
    expect(offered).not.toContain('help_below');
    expect(offered).toContain('files');
    expect(offered).toContain('forum');
    expect(offeredBlocks(on('calendar', 'library', 'library.questions', 'library.daily-question'), { signedIn: false, tracking: false })).toContain('daily_question');
  });
  it('needs an account for account blocks and lesson progress for Continue', () => {
    const guest = offeredBlocks(on('board', 'forum', 'forum.help-below'), { signedIn: false, tracking: false });
    expect(guest).not.toContain('todo');
    expect(guest).not.toContain('help_below');
    expect(guest).not.toContain('continue');
    expect(offeredBlocks(on(), { signedIn: false, tracking: true })).toContain('continue');
  });
  it('puts the dashboard first by default', () => {
    expect(STUDENT_DEFAULT).toEqual(['start_here', 'results_day', 'coming_up', 'todo', 'continue', 'modules', 'files', 'forum', 'daily', 'noora']);
  });
});
