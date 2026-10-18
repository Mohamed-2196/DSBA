// Whether Mini Noora is on screen. A student can hide her from her chat and bring her back from the command
// palette ("Show Mini Noora"); the choice stays on this device (localStorage hub.noora.hidden = '1', which the
// screenshot tooling also sets). Every tab follows a change at once.
import { useEffect, useSyncExternalStore } from 'react';

const HIDDEN_KEY = 'hub.noora.hidden';
const CHANGED = 'hub:noora-visibility';

/** True when she has been hidden on this device. */
export function isMiniNooraHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

// The choice made on this page, for when storage is refused (a private window): it lasts until a reload.
let chosen: boolean | null = null;

function setHidden(hidden: boolean): void {
  chosen = hidden;
  try {
    if (hidden) window.localStorage.setItem(HIDDEN_KEY, '1');
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* refused: `chosen` carries it */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export const hideMiniNoora = (): void => setHidden(true);
export const showMiniNoora = (): void => setHidden(false);

const read = (): boolean => chosen ?? isMiniNooraHidden();

function subscribe(change: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== HIDDEN_KEY) return;
    chosen = null; // another tab chose: storage has it
    change();
  };
  window.addEventListener(CHANGED, change);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, change);
    window.removeEventListener('storage', onStorage);
  };
}

/** Whether she is hidden, kept up to date. */
export function useMiniNooraHidden(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

// ── Stepping away ───────────────────────────────────────────────────────────────────────────────
// A page whose controls fill the screen (a daily puzzle) asks her to step away while it is open, so she never
// covers them. Nothing is stored: she is back as soon as the page closes.

const AWAY = 'hub:noora-away';
let awayCount = 0;

function subscribeAway(change: () => void): () => void {
  window.addEventListener(AWAY, change);
  return () => window.removeEventListener(AWAY, change);
}

/** Keeps her off screen while the calling component is mounted. */
export function useMiniNooraAway(): void {
  useEffect(() => {
    awayCount += 1;
    window.dispatchEvent(new Event(AWAY));
    return () => {
      awayCount -= 1;
      window.dispatchEvent(new Event(AWAY));
    };
  }, []);
}

/** Whether a page has asked her to step away. */
export function useMiniNooraIsAway(): boolean {
  return useSyncExternalStore(
    subscribeAway,
    () => awayCount > 0,
    () => false,
  );
}
