// Quick Look for a list of files: Space on a file (the one with keyboard focus, or the one under the mouse), the
// arrow keys through the list, and each file's Preview button. The dialog is QuickLookDialog.tsx.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { LibraryItem } from '../types';
import { QuickLookDialog } from './QuickLookDialog';
import { QL_BUTTON, QL_FILE, QL_LINK, focusedOf, ownsSpace } from './rules';

export interface QuickLook {
  /** for the list's element: Space works on the files inside it */
  listProps: {
    ref: (el: HTMLElement | null) => void;
    onPointerOver: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
  };
  /** opens Quick Look on a file from its Preview button */
  preview: (item: LibraryItem) => void;
  /** render it once, beside the list */
  dialog: ReactNode;
}

/** Quick Look for a list of files: Space on a file opens it (Space stays with text fields and buttons), the arrow keys
 *  move through `items`, and each file's Preview button opens it on touch screens. The list marks each file with QL_FILE (its id), the link that opens it with QL_LINK, its Preview button with
 *  QL_BUTTON. */
export function useQuickLook(items: readonly LibraryItem[]): QuickLook {
  const box = useRef<HTMLElement | null>(null);
  const hovered = useRef<string | null>(null);
  // `shown` stays while the dialog animates out.
  const [shown, setShown] = useState<{ id: string; via: 'key' | 'button' } | null>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      const list = box.current;
      if (openRef.current || !list || document.querySelector('[aria-modal="true"]')) return;
      const active = document.activeElement;
      let id: string | null = null;
      if (active && active !== document.body && list.contains(active)) {
        if (!active.hasAttribute(QL_LINK)) return; // a button in the list: Space presses it
        id = active.closest(`[${QL_FILE}]`)?.getAttribute(QL_FILE) ?? null;
      } else if (
        hovered.current &&
        (!active || active === document.body || !(ownsSpace(focusedOf(active)) || active.tagName === 'A'))
      ) {
        id = hovered.current;
      }
      if (!id || !itemsRef.current.some((it) => it.id === id)) return;
      e.preventDefault();
      setShown({ id, via: 'key' });
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const close = useCallback(() => {
    // Focus goes back to the file now shown (the arrow keys may have moved on from the one opened).
    if (shown) {
      const file = box.current?.querySelector(`[${QL_FILE}="${CSS.escape(shown.id)}"]`);
      const back = file?.querySelector<HTMLElement>(`[${shown.via === 'button' ? QL_BUTTON : QL_LINK}]`);
      back?.focus();
    }
    setOpen(false);
  }, [shown]);

  const item = shown ? items.find((it) => it.id === shown.id) : undefined;
  return {
    listProps: {
      ref: (el) => {
        box.current = el;
      },
      onPointerOver: (e) => {
        if (e.pointerType !== 'mouse' || !(e.target instanceof Element)) return;
        hovered.current = e.target.closest(`[${QL_FILE}]`)?.getAttribute(QL_FILE) ?? null;
      },
      onPointerLeave: () => {
        hovered.current = null;
      },
    },
    preview: (it) => {
      setShown({ id: it.id, via: 'button' });
      setOpen(true);
    },
    dialog: item ? (
      <QuickLookDialog
        open={open}
        item={item}
        items={items}
        onMove={(id) => setShown((s) => (s ? { ...s, id } : s))}
        onClose={close}
      />
    ) : null,
  };
}
