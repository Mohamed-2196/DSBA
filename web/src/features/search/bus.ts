// Tiny event bus so anything can open the palette without importing its component.
export const OPEN_PALETTE_EVENT = 'hub:open-command-palette';

export interface OpenPaletteDetail {
  query: string;
}

export function openCommandPalette(initialQuery = ''): void {
  window.dispatchEvent(new CustomEvent<OpenPaletteDetail>(OPEN_PALETTE_EVENT, { detail: { query: initialQuery } }));
}
