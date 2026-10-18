import { describe, expect, it } from 'vitest';
import type { Message } from './types';
import {
  CHATS_KEY,
  CHATS_MAX,
  CURRENT_KEY,
  forStorage,
  groupChats,
  parseChats,
  parseCurrent,
  renameChat,
  searchChats,
  titleOf,
  withChat,
  withoutChat,
} from './saved';

const q = (id: number, text: string): Message => ({ id, from: 'me', at: id, text, attachments: [] });
const a = (id: number, text: string): Message => ({ id, from: 'noora', at: id, mood: 'neutral', text, refs: [] });

describe('keys', () => {
  it('are personal, so signing out clears them', () => {
    expect(CHATS_KEY.startsWith('hub.mine.')).toBe(true);
    expect(CURRENT_KEY.startsWith('hub.mine.')).toBe(true);
  });
});

describe('forStorage', () => {
  it('keeps pictures only by name', () => {
    const shot = { id: 'f1', kind: 'image' as const, name: 'board.png', size: 10, url: 'blob:x' };
    const [stored] = forStorage([{ id: 1, from: 'me', at: 1, text: '', attachments: [shot] }]);
    expect(stored).toMatchObject({ attachments: [{ name: 'board.png', url: null }] });
  });
});

describe('titleOf', () => {
  it('is the first question, shortened', () => {
    expect(titleOf([q(1, '  When is   my exam? '), a(2, 'x')])).toBe('When is my exam?');
    expect(titleOf([q(1, 'x'.repeat(100))])).toHaveLength(80);
    expect(titleOf([])).toBe('New chat');
  });
});

describe('withChat', () => {
  it('puts the conversation first, once, and keeps the newest ones', () => {
    let list = withChat([], 'a', [q(1, 'first')]);
    list = withChat(list, 'b', [q(2, 'second')]);
    list = withChat(list, 'a', [q(1, 'first'), a(3, 'answer')]);
    expect(list.map((c) => c.id)).toEqual(['a', 'b']);
    expect(list[0]).toMatchObject({ title: 'first', at: 3 });
    for (let i = 0; i < CHATS_MAX + 5; i += 1) list = withChat(list, `c${i}`, [q(i, 'x')]);
    expect(list).toHaveLength(CHATS_MAX);
  });

  it('drops a conversation that has been emptied', () => {
    expect(withChat(withChat([], 'a', [q(1, 'x')]), 'a', [])).toEqual([]);
  });

  it('keeps a name the student gave', () => {
    const named = renameChat(withChat([], 'a', [q(1, 'first')]), 'a', 'Revision plan');
    const later = withChat(named, 'a', [q(1, 'first'), a(2, 'y')]);
    expect(later[0]).toMatchObject({ title: 'Revision plan', named: true });
  });
});

describe('renameChat and withoutChat', () => {
  it('renames, and an empty name goes back to the first question', () => {
    const list = withChat([], 'a', [q(1, 'What is a p-value?')]);
    expect(renameChat(list, 'a', '  Stats   help ')[0]).toMatchObject({ title: 'Stats help', named: true });
    const back = renameChat(renameChat(list, 'a', 'Stats'), 'a', '  ')[0];
    expect(back?.title).toBe('What is a p-value?');
    expect(back?.named).toBeUndefined();
  });

  it('deletes one', () => {
    const list = withChat(withChat([], 'a', [q(1, 'x')]), 'b', [q(2, 'y')]);
    expect(withoutChat(list, 'a').map((c) => c.id)).toEqual(['b']);
  });
});

describe('searchChats', () => {
  it('matches every word in the name or the messages', () => {
    let list = withChat([], 'a', [q(1, 'Explain the central limit theorem'), a(2, 'It says sample means are normal')]);
    list = withChat(list, 'b', [q(3, 'Plan my revision for ST2133')]);
    expect(searchChats(list, 'CENTRAL').map((c) => c.id)).toEqual(['a']);
    expect(searchChats(list, 'sample normal').map((c) => c.id)).toEqual(['a']);
    expect(searchChats(list, 'revision theorem')).toEqual([]);
    expect(searchChats(list, '  ')).toHaveLength(2);
  });
});

describe('groupChats', () => {
  it('groups by day, newest first', () => {
    const now = new Date(2026, 9, 14, 15).getTime();
    const day = 86_400_000;
    const chat = (id: string, at: number) => ({ id, at, title: id, messages: [] });
    const groups = groupChats(
      [
        chat('old', now - 60 * day),
        chat('today', now - 1000),
        chat('yesterday', now - day),
        chat('week', now - 3 * day),
        chat('month', now - 20 * day),
      ],
      now,
    );
    expect(groups.map((g) => [g.name, g.chats.map((c) => c.id)])).toEqual([
      ['Today', ['today']],
      ['Yesterday', ['yesterday']],
      ['Previous 7 days', ['week']],
      ['Previous 30 days', ['month']],
      ['Earlier', ['old']],
    ]);
  });
});

describe('parseChats and parseCurrent', () => {
  it('trust only what has the right shape', () => {
    const good = withChat([], 'a', [q(1, 'x'), a(2, 'y')]);
    expect(parseChats(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseChats([{ id: 'a', at: 1, title: 't', messages: [{ from: 'me' }] }, 'junk'])).toEqual([]);
    expect(parseChats([{ id: 'a', at: 1, title: 't', named: 'yes', messages: [] }])).toEqual([]);
    expect(parseChats('nope')).toEqual([]);
    expect(parseCurrent({ id: 'a', messages: [q(1, 'x')] })).toEqual({ id: 'a', messages: [q(1, 'x')] });
    expect(parseCurrent({ id: 1, messages: [] })).toBeNull();
  });
});
