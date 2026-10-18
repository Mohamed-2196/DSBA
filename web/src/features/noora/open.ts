// Opening Noora, from anywhere in the Hub:
//   the card   Mini Noora's chat card beside her. Whether it is open is shared by her, the keyboard shortcut, the
//              command palette and the file viewer. It lasts while the student moves around the Hub, not across a
//              reload. Whatever opened it gets the keyboard back when it closes (or she does, when that is gone).
//   the page   /noora, the full chat. openNoora() asks the shell to go there (MiniNoora.tsx listens: a plain
//              function has no router), with a question to ask at once or a conversation to carry on with.
import { useSyncExternalStore } from 'react';
import { showMiniNoora } from './visibility';

const CHANGED = 'hub:noora-open';
const GO = 'hub:noora-page';

/** The full page's address. */
export const NOORA_PATH = '/noora';

/** The chat card's element id: her button's aria-controls points at it. */
export const CHAT_ID = 'noora-chat';

let open = false;
let opener: HTMLElement | null = null;

function set(next: boolean): void {
  if (open === next) return;
  open = next;
  window.dispatchEvent(new Event(CHANGED));
}

/** Open her chat card. `from`: the control that opened it, which gets focus back when it closes. */
export function openCard(from: HTMLElement | null = null): void {
  opener = from;
  set(true);
}

/** Bring her back if she was hidden, and open her chat card (the shortcut and the command palette). */
export function askNoora(from: HTMLElement | null = null): void {
  showMiniNoora();
  openCard(from);
}

/** Close her chat card and give the keyboard back to whatever opened it, or to her. */
export function closeCard({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  const from = opener;
  opener = null;
  set(false);
  if (!restoreFocus) return;
  requestAnimationFrame(() => {
    if (open) return;
    const back =
      from?.isConnected && from.getClientRects().length
        ? from
        : document.querySelector<HTMLElement>('[data-hub="noora-launcher"]');
    (back ?? document.getElementById('main'))?.focus({ preventScroll: true });
  });
}

export function toggleCard(from: HTMLElement | null = null): void {
  if (open) closeCard();
  else openCard(from);
}

function subscribe(change: () => void): () => void {
  window.addEventListener(CHANGED, change);
  return () => window.removeEventListener(CHANGED, change);
}

/** Whether her chat card is open, kept up to date. */
export function useCardOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

/** The keyboard shortcut that opens or closes her chat: ⌘/ on a Mac, Ctrl+/ elsewhere. */
export function isNooraShortcut(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): boolean {
  return e.key === '/' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

/** What the full page is opened with (the router's location state). */
export interface PageOpening {
  /** a question to ask at once, in a new chat */
  ask?: string;
  /** a saved conversation to show */
  chat?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The opening a location's state holds, checked (history state outlives the page). */
export function pageOpening(state: unknown): PageOpening {
  if (!isObject(state)) return {};
  const ask = typeof state.ask === 'string' && state.ask.trim() ? state.ask.trim() : undefined;
  const chat = typeof state.chat === 'string' && state.chat ? state.chat : undefined;
  return { ...(ask ? { ask } : {}), ...(chat ? { chat } : {}) };
}

/** Go to the full page: with `prompt`, it is asked at once in a new chat. */
export function openNoora(prompt?: string): void {
  goToPage(prompt ? { ask: prompt } : {});
}

/** Go to the full page with an opening (the card's "Open full chat" carries its conversation over). */
export function goToPage(opening: PageOpening): void {
  window.dispatchEvent(new CustomEvent<PageOpening>(GO, { detail: opening }));
}

/** Listen for openNoora(): MiniNoora.tsx navigates. Returns the unsubscribe. */
export function onGoToPage(go: (opening: PageOpening) => void): () => void {
  const listener = (e: Event) => go(pageOpening(e instanceof CustomEvent ? e.detail : null));
  window.addEventListener(GO, listener);
  return () => window.removeEventListener(GO, listener);
}
