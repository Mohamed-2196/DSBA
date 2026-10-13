import { describe, expect, it } from 'vitest';
import { House } from '@phosphor-icons/react';
import type { NavItem } from './nav';
import { visibleNav } from './visibility';

const item = (id: string, feature?: NavItem['feature']): NavItem => ({ id, label: id, to: `/${id}`, icon: House, feature });

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
