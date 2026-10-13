import { describe, expect, it } from 'vitest';
import type { FeatureOut } from '../../api/types';
import { switchBody, switchSummary } from './switches';

const f = (mode: FeatureOut['mode'], roleIds: string[] = []): FeatureOut => ({ feature: 'calendar', label: 'Calendar', hides: 'The calendar.', mode, roleIds });
const names: Record<string, string> = { r1: 'Testers', r2: 'Rep' };

describe('switchSummary', () => {
  it('says who sees the feature', () => {
    expect(switchSummary(f('everyone'), (id) => names[id] ?? null)).toBe('On for everyone');
    expect(switchSummary(f('off'), (id) => names[id] ?? null)).toBe('Off');
    expect(switchSummary(f('roles', ['r1', 'r2']), (id) => names[id] ?? null)).toBe('On for Testers and Rep');
  });

  it('skips roles it no longer knows', () => {
    expect(switchSummary(f('roles', ['r1', 'gone']), (id) => names[id] ?? null)).toBe('On for Testers');
  });
});

describe('switchBody', () => {
  it('sends roles only for "roles"', () => {
    expect(switchBody('everyone', ['r1'])).toEqual({ mode: 'everyone', roleIds: [] });
    expect(switchBody('roles', ['r2', 'r1'])).toEqual({ mode: 'roles', roleIds: ['r1', 'r2'] });
  });
});
