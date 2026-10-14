// Whether Mini Noora's chat is open, shared by her, the keyboard shortcut, the command palette and the file viewer.
// It lasts while the student moves around the Hub, not across a reload. Whatever opened it gets the keyboard back
// when it closes (or she does, when that is gone).
import { useSyncExternalStore } from 'react';
import { showMiniNoora } from './visibility';

const CHANGED = 'hub:noora-open';

/** The chat card's element id: her button's aria-controls points at it. */
export const CHAT_ID = 'noora-chat';

let open = false;
let opener: HTMLElement | null = null;

function set(next: boolean): void {
  if (open === next) return;
  open = next;
  window.dispatchEvent(new Event(CHANGED));
}

/** Open her chat. `from`: the control that opened it, which gets focus back when it closes. */
export function openNoora(from: HTMLElement | null = null): void {
  opener = from;
  set(true);
}

/** Bring her back if she was hidden, and open her chat (the shortcut and the command palette). */
export function askNoora(from: HTMLElement | null = null): void {
  showMiniNoora();
  openNoora(from);
}

/** Close her chat and give the keyboard back to whatever opened it, or to her. */
export function closeNoora({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  const from = opener;
  opener = null;
  set(false);
  if (!restoreFocus) return;
  requestAnimationFrame(() => {
    if (open) return;
    const back = from?.isConnected && from.getClientRects().length ? from : document.querySelector<HTMLElement>('[data-hub="noora-launcher"]');
    (back ?? document.getElementById('main'))?.focus({ preventScroll: true });
  });
}

export function toggleNoora(from: HTMLElement | null = null): void {
  if (open) closeNoora();
  else openNoora(from);
}

function subscribe(change: () => void): () => void {
  window.addEventListener(CHANGED, change);
  return () => window.removeEventListener(CHANGED, change);
}

/** Whether her chat is open, kept up to date. */
export function useNooraOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

/** The keyboard shortcut that opens or closes her chat: ⌘/ on a Mac, Ctrl+/ elsewhere. */
export function isNooraShortcut(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return e.key === '/' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}
