import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNooraShortcut, onGoToPage, openNoora, pageOpening } from './open';

describe('open', () => {
  let listeners: Map<string, Set<(e: unknown) => void>>;

  beforeEach(() => {
    listeners = new Map();
    vi.stubGlobal('Event', class Event {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    });
    vi.stubGlobal('CustomEvent', class CustomEvent<T> {
      type: string;
      detail: T;
      constructor(type: string, init?: { detail: T }) {
        this.type = type;
        this.detail = init?.detail as T;
      }
    });
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: (e: unknown) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: (e: unknown) => void) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: { type: string; detail?: unknown }) => {
        const set = listeners.get(event.type);
        if (set) for (const fn of set) fn(event);
        return true;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses page openings from router state', () => {
    expect(pageOpening(null)).toEqual({});
    expect(pageOpening({})).toEqual({});
    expect(pageOpening({ ask: '  how does gradient descent work?  ' })).toEqual({
      ask: 'how does gradient descent work?',
    });
    expect(pageOpening({ chat: 'chat-123' })).toEqual({ chat: 'chat-123' });
    expect(pageOpening({ ask: 'quiz me', chat: 'chat-456' })).toEqual({
      ask: 'quiz me',
      chat: 'chat-456',
    });
  });

  it('detects keyboard shortcut', () => {
    expect(isNooraShortcut({ key: '/', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isNooraShortcut({ key: '/', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isNooraShortcut({ key: '/', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false })).toBe(false);
    expect(isNooraShortcut({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBe(false);
  });

  it('navigates with openNoora', () => {
    const handleGo = vi.fn();
    const unsubscribe = onGoToPage(handleGo);
    try {
      openNoora('explain CLT');
      expect(handleGo).toHaveBeenCalledWith({ ask: 'explain CLT' });

      openNoora();
      expect(handleGo).toHaveBeenCalledWith({});
    } finally {
      unsubscribe();
    }
  });
});
