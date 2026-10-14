import { describe, expect, it } from 'vitest';
import type { Message } from './types';
import { RECENT_MAX, forStorage, parseCurrent, parseRecent, titleOf, withChat } from './saved';

const q = (id: number, text: string): Message => ({ id, from: 'me', at: id, text, attachments: [] });
const a = (id: number, text: string): Message => ({ id, from: 'noora', at: id, mood: 'neutral', text, refs: [] });

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
  it('puts the conversation first, once, and keeps the newest few', () => {
    let list = withChat([], 'a', [q(1, 'first')]);
    list = withChat(list, 'b', [q(2, 'second')]);
    list = withChat(list, 'a', [q(1, 'first'), a(3, 'answer')]);
    expect(list.map((c) => c.id)).toEqual(['a', 'b']);
    expect(list[0]).toMatchObject({ title: 'first', at: 3 });
    for (let i = 0; i < 10; i += 1) list = withChat(list, `c${i}`, [q(i, 'x')]);
    expect(list).toHaveLength(RECENT_MAX);
  });

  it('drops a conversation that has been emptied', () => {
    expect(withChat(withChat([], 'a', [q(1, 'x')]), 'a', [])).toEqual([]);
  });
});

describe('parseRecent and parseCurrent', () => {
  it('trust only what has the right shape', () => {
    const good = withChat([], 'a', [q(1, 'x'), a(2, 'y')]);
    expect(parseRecent(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseRecent([{ id: 'a', at: 1, title: 't', messages: [{ from: 'me' }] }, 'junk'])).toEqual([]);
    expect(parseRecent('nope')).toEqual([]);
    expect(parseCurrent({ id: 'a', messages: [q(1, 'x')] })).toEqual({ id: 'a', messages: [q(1, 'x')] });
    expect(parseCurrent({ id: 1, messages: [] })).toBeNull();
  });
});
