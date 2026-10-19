import { describe, expect, it } from 'vitest';
import { House } from '@phosphor-icons/react';
import type { NavItem } from './nav';
import { loadingNav, rememberedNav, visibleNav } from './visibility';

const item = (id: string, feature?: NavItem['feature']): NavItem => ({
  id,
  label: id,
  to: `/${id}`,
  icon: House,
  feature,
});

describe('visibleNav', () => {
  it('keeps items without a feature and those whose feature is on', () => {
    const nav = [item('home'), item('forum', 'forum'), item('calendar', 'calendar')];
    expect(visibleNav(nav, (f) => f === 'forum').map((n) => n.id)).toEqual(['home', 'forum']);
  });

  it('shows personal items (notes) to signed-in people only', () => {
    const nav = [item('home'), { ...item('notes', 'notes'), signedIn: true as const }];
    expect(visibleNav(nav, () => true).map((n) => n.id)).toEqual(['home']);
    expect(visibleNav(nav, () => true, true).map((n) => n.id)).toEqual(['home', 'notes']);
    expect(visibleNav(nav, () => false, true).map((n) => n.id)).toEqual(['home']);
  });
});

describe('while the account loads (UX-77)', () => {
  const nav: NavItem[] = [
    item('home'),
    item('noora', 'noora'),
    item('forum', 'forum'),
    { ...item('notes'), signedIn: true },
  ];

  it('shows what was shown last time', () => {
    expect(loadingNav(nav, ['home', 'forum']).map((n) => n.id)).toEqual(['home', 'forum']);
  });

  it('shows every entry that needs no account on a first visit', () => {
    expect(loadingNav(nav, null).map((n) => n.id)).toEqual(['home', 'noora', 'forum']);
  });

  it('reads back only a list of ids', () => {
    expect(rememberedNav(['home'])).toEqual(['home']);
    expect(rememberedNav('home')).toBeNull();
    expect(rememberedNav([1])).toBeNull();
  });
});
