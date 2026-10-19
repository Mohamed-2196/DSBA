import { House, Kanban } from '@phosphor-icons/react';
import { describe, expect, it } from 'vitest';
import type { NavItem } from './nav';
import { asSeen, markSeen, navAt, withSeen } from './seen';

const ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', to: '/', icon: House, end: true },
  { id: 'forum', label: 'Forum', to: '/forum', icon: Kanban, isNew: true },
  { id: 'daily', label: 'Daily', to: '/daily', icon: Kanban, isNew: true },
];

describe('navAt', () => {
  it('finds the section of a page, and of a page under it', () => {
    expect(navAt(ITEMS, '/forum')?.id).toBe('forum');
    expect(navAt(ITEMS, '/forum/some-thread')?.id).toBe('forum');
    expect(navAt(ITEMS, '/')?.id).toBe('home');
    expect(navAt(ITEMS, '/forumx')).toBeNull();
    expect(navAt(ITEMS, '/library')).toBeNull();
  });
});

describe('seen sections', () => {
  it('keeps New until this account opens the section', () => {
    let seen = markSeen({}, 'sara', 'forum');
    const shown = withSeen(ITEMS, seen, 'sara');
    expect(shown.find((n) => n.id === 'forum')?.isNew).toBe(false);
    expect(shown.find((n) => n.id === 'daily')?.isNew).toBe(true);
    // Another account, or a guest, on the same browser still sees it.
    expect(withSeen(ITEMS, seen, 'ali').find((n) => n.id === 'forum')?.isNew).toBe(true);
    expect(withSeen(ITEMS, seen, null).find((n) => n.id === 'forum')?.isNew).toBe(true);
    seen = markSeen(seen, null, 'daily');
    expect(withSeen(ITEMS, seen, null).find((n) => n.id === 'daily')?.isNew).toBe(false);
  });

  it('returns the same list when the section was already seen', () => {
    const seen = markSeen({}, 'sara', 'forum');
    expect(markSeen(seen, 'sara', 'forum')).toBe(seen);
  });

  it('reads a stored value of any shape', () => {
    expect(asSeen(null)).toEqual({});
    expect(asSeen(['forum'])).toEqual({});
    expect(asSeen({ sara: ['forum', 3], ali: 'daily' })).toEqual({ sara: ['forum'] });
  });
});
