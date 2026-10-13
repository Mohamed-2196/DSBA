// Whether Mini Noora's panel is open, shared by her launchers (the top bar, the phone tab bar, the edge tab) and the
// panel itself. It lasts while the student moves around the Hub, not across a reload. The launcher that opened it
// gets the keyboard back when it closes.
import { useSyncExternalStore } from 'react';

const CHANGED = 'hub:noora-dock';

/** The panel's element id: every launcher's aria-controls points at it. */
export const PANEL_ID = 'noora-panel';

let open = false;
let opener: HTMLElement | null = null;

function set(next: boolean): void {
  if (open === next) return;
  open = next;
  window.dispatchEvent(new Event(CHANGED));
}

/** Open her panel. `from`: the control that opened it, which gets focus back when it closes. */
export function openNoora(from: HTMLElement | null = null): void {
  opener = from;
  set(true);
}

/** Close her panel and give the keyboard back to whatever opened it (or to a launcher still on screen). */
export function closeNoora({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  const from = opener;
  opener = null;
  set(false);
  if (!restoreFocus) return;
  // After the next frame: the laptop's edge tab is only on screen while the panel is closed, so React has to
  // render the close first.
  requestAnimationFrame(() => {
    if (open) return;
    const back = from?.isConnected && from.getClientRects().length ? from : visibleLauncher();
    (back ?? document.getElementById('main'))?.focus({ preventScroll: true });
  });
}

export function toggleNoora(from: HTMLElement | null = null): void {
  if (open) closeNoora();
  else openNoora(from);
}

function visibleLauncher(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-hub="noora-launcher"]'));
  return all.find((el) => el.getClientRects().length > 0) ?? null;
}

function subscribe(change: () => void): () => void {
  window.addEventListener(CHANGED, change);
  return () => window.removeEventListener(CHANGED, change);
}

/** Whether her panel is open, kept up to date. */
export function useNooraOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}

/** The two widths of the docked panel on a laptop; the choice is remembered per viewer (hub.noora.width). */
export const WIDTH_KEY = 'hub.noora.width';
export type DockWidth = 'narrow' | 'wide';
export const isDockWidth = (v: unknown): v is DockWidth => v === 'narrow' || v === 'wide';
