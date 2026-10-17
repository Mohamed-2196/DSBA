// What the document editors share besides their components: leaving with unsaved changes, and ids for new items.
import { useEffect } from 'react';

/** Leaving the page with unsaved changes asks first. */
export function useWarnBeforeLeaving(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

/** An id for a new item: lowercase letters and digits, never shown, never changed. */
export function newItemId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = used.size + 1; ; n += 1) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}
