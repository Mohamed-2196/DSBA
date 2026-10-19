// How the palette is opened from anywhere: ⌘K / Ctrl+K toggles it, "/" opens it outside text fields, and
// openCommandPalette(query) (bus.ts) opens it with a query. Never over another dialog. Until it is first opened,
// PaletteHost listens; then the palette itself does.
import { useEffect } from 'react';
import { OPEN_PALETTE_EVENT, type OpenPaletteDetail } from './bus';

const isEditable = (el: EventTarget | null): boolean =>
  el instanceof Element && !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
const otherDialogOpen = (): boolean =>
  [...document.querySelectorAll('[aria-modal="true"]')].some((d) => !d.closest('[data-hub="cmdk"]'));

export function usePaletteShortcuts(show: (query: string) => void, toggle: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onOpen = (e: Event) => {
      if (otherDialogOpen()) return;
      show((e as CustomEvent<OpenPaletteDetail>).detail?.query ?? '');
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        if (!otherDialogOpen()) toggle();
        return;
      }
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.defaultPrevented &&
        !isEditable(e.target) &&
        !otherDialogOpen()
      ) {
        e.preventDefault();
        show('');
      }
    };
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, [show, toggle, enabled]);
}
