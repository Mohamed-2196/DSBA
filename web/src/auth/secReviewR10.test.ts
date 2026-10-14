// Security review, rounds 5 to 9 (docs/reviews/security.md), SEC-31: Noora's saved conversations must not outlive
// sign-out on a shared computer, in localStorage (every chat) or sessionStorage (the tab's open chat).
import { afterEach, beforeEach, expect, it } from 'vitest';
import { CHATS_KEY, CURRENT_KEY } from '../features/noora/saved';
import { clearPersonalStorage } from './queries';

function memory() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
}
let local = memory();
let session = memory();
const g = globalThis as unknown as {
  window?: EventTarget & { localStorage: typeof local; sessionStorage: typeof session };
};

beforeEach(() => {
  local = memory();
  session = memory();
  g.window = Object.assign(new EventTarget(), { localStorage: local, sessionStorage: session });
});

afterEach(() => {
  delete g.window;
});

it('SEC-31: signing out removes Noora’s chats from both storage areas', () => {
  local.setItem('theme', '"dark"');
  local.setItem(CHATS_KEY, JSON.stringify([{ id: 'chat-1', at: 1, title: 'Is my resit fee refundable?', messages: [] }]));
  session.setItem(CURRENT_KEY, JSON.stringify({ id: 'chat-1', messages: [] }));
  session.setItem('hub.other', '1');
  clearPersonalStorage();
  expect(local.getItem(CHATS_KEY)).toBeNull();
  expect(session.getItem(CURRENT_KEY)).toBeNull();
  expect(local.getItem('theme')).toBe('"dark"'); // device settings stay
  expect(session.getItem('hub.other')).toBe('1');
});
