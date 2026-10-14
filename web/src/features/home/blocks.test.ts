import { describe, expect, it } from 'vitest';
import { GUEST_DEFAULT, STUDENT_DEFAULT, layoutOf, moveBlock, normalizeBlocks, showBlock, withUnavailable, type HomeBlock } from './blocks';

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
    expect(l.shown).toEqual(['coming_up', 'todo', 'modules', 'newsletter']);
    expect(l.hidden).toEqual([]);
  });
  it('shows the saved blocks in their order and lists the rest as hidden', () => {
    const l = layoutOf(['modules', 'coming_up'], STUDENT_DEFAULT, all('coming_up', 'modules', 'todo', 'new'));
    expect(l.shown).toEqual(['modules', 'coming_up']);
    expect(l.hidden).toEqual(['todo', 'new']);
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
