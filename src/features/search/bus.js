// Tiny event bus so anything can open the palette without importing its component.
export const OPEN_PALETTE_EVENT = 'pulse:open-command-palette';

export function openCommandPalette(initialQuery = '') {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query: initialQuery } }));
}
