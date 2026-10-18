// Signing out must reset what mounted hooks hold, not only what storage holds, in both storage areas.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHATS_KEY, CURRENT_KEY } from '../features/noora/saved';
import { bindStored, removeStored } from '../state/storedValue';
import { clearPersonalStorage } from './queries';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

type FakeWindow = EventTarget & { localStorage: MemoryStorage; sessionStorage: MemoryStorage };
const g = globalThis as unknown as { window?: FakeWindow };
let storage: MemoryStorage;
let session: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  session = new MemoryStorage();
  g.window = Object.assign(new EventTarget(), { localStorage: storage, sessionStorage: session });
});

afterEach(() => {
  delete g.window;
});

const RECENT = 'hub.mine.search.recent';

describe('clearPersonalStorage', () => {
  it('resets a mounted holder, so its next update cannot bring the old value back', () => {
    // The search palette stays mounted for the app's lifetime.
    const palette = bindStored<string[]>(RECENT, () => [], 'palette');
    let changes = 0;
    const stop = palette.subscribe(() => changes++);
    palette.set(['previous person: resit appeal']);

    clearPersonalStorage();

    expect(storage.getItem(RECENT)).toBeNull();
    expect(palette.get()).toEqual([]);
    expect(changes).toBe(1);

    // The next person searches: only their search is kept.
    palette.set((prev) => ['calendar', ...prev]);
    expect(JSON.parse(storage.getItem(RECENT) ?? 'null')).toEqual(['calendar']);
    stop();
  });

  it('removes drafts and every personal key, and keeps the device settings', () => {
    storage.setItem('hub.mine.forum.draft', '{"title":"Resit appeal"}');
    storage.setItem('hub.mine.grades', '{"st1131":70}');
    storage.setItem(RECENT, '["mgf"]');
    storage.setItem('theme', 'dark');
    storage.setItem('selectedYear', '"2"');
    storage.setItem('hub.progress', '{}');

    clearPersonalStorage();

    expect(storage.getItem('hub.mine.forum.draft')).toBeNull();
    expect(storage.getItem('hub.mine.grades')).toBeNull();
    expect(storage.getItem(RECENT)).toBeNull();
    expect(storage.getItem('theme')).toBe('dark');
    expect(storage.getItem('selectedYear')).toBe('"2"');
    expect(storage.getItem('hub.progress')).toBe('{}');
  });

  it('removes Noora’s chats from both storage areas', () => {
    storage.setItem('theme', '"dark"');
    storage.setItem(
      CHATS_KEY,
      JSON.stringify([{ id: 'chat-1', at: 1, title: 'Is my resit fee refundable?', messages: [] }]),
    );
    session.setItem(CURRENT_KEY, JSON.stringify({ id: 'chat-1', messages: [] }));
    session.setItem('hub.other', '1');
    clearPersonalStorage();
    expect(storage.getItem(CHATS_KEY)).toBeNull();
    expect(session.getItem(CURRENT_KEY)).toBeNull();
    expect(storage.getItem('theme')).toBe('"dark"'); // device settings stay
    expect(session.getItem('hub.other')).toBe('1');
  });

  it('does nothing when storage is unavailable', () => {
    delete g.window;
    expect(() => clearPersonalStorage()).not.toThrow();
  });
});

describe('stored values', () => {
  it('keeps holders of one key in step, and ignores other keys', () => {
    const a = bindStored<number>('hub.count', () => 0, 'a');
    const b = bindStored<number>('hub.count', () => 0, 'b');
    const other = bindStored<number>('hub.other', () => 5, 'c');
    const stops = [a.subscribe(() => undefined), b.subscribe(() => undefined), other.subscribe(() => undefined)];

    a.set(3);
    expect(b.get()).toBe(3);
    b.set((n) => n + 1);
    expect(a.get()).toBe(4);
    expect(other.get()).toBe(5);

    removeStored('hub.count');
    expect([a.get(), b.get()]).toEqual([0, 0]);
    stops.forEach((stop) => stop());
  });

  it('follows another tab, and a cleared storage', () => {
    const a = bindStored<string>('hub.mine.note', () => '', 'a');
    const stop = a.subscribe(() => undefined);
    storage.setItem('hub.mine.note', '"from the other tab"');
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'hub.mine.note' }));
    expect(a.get()).toBe('from the other tab');

    storage.clear();
    window.dispatchEvent(Object.assign(new Event('storage'), { key: null }));
    expect(a.get()).toBe('');
    stop();
  });

  it('falls back to the initial value for anything that is not JSON', () => {
    storage.setItem('hub.broken', '{nope');
    expect(bindStored('hub.broken', () => 'fallback', 'a').get()).toBe('fallback');
  });
});
