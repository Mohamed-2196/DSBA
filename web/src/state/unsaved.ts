// Unsaved changes on a page that holds several editors at once (Manage keeps each visited tab's editor mounted). Each
// editor reports its own with useUnsavedChanges(); the page keeps them with useUnsavedRegistry() and has the one leave
// guard (useLeaveGuard) that asks before a navigation would lose them.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { Location } from 'react-router-dom';

export interface UnsavedEditor {
  /** what holds the changes, for the question: 'Site settings' */
  name: string;
  /** whether the editor stays on screen at `to`, another address of the same page (a module's form leaves when its
   *  ?module changes); without it, only another page loses the changes */
  keeps?: (to: Location) => boolean;
}

interface UnsavedRegistry {
  report: (id: string, editor: UnsavedEditor | null) => void;
  bypass: (go: () => void) => void;
}

const UnsavedContext = createContext<UnsavedRegistry | null>(null);

/** The page's registry, for the editors inside it: `report` from useUnsavedRegistry, `bypass` from its leave guard. */
export const UnsavedProvider = UnsavedContext.Provider;

const runNow = (go: () => void) => go();

/**
 * Reports this editor's unsaved changes to the page's leave guard; outside such a page, nothing. Returns `bypass`: the
 * editor's own navigations after a save or a delete go through it without asking. Pass `keeps` as a stable function.
 */
export function useUnsavedChanges(
  dirty: boolean,
  name: string,
  keeps?: (to: Location) => boolean,
): (go: () => void) => void {
  const registry = useContext(UnsavedContext);
  const id = useId();
  useEffect(() => {
    if (!registry || !dirty) return undefined;
    registry.report(id, { name, keeps });
    return () => registry.report(id, null);
  }, [registry, id, dirty, name, keeps]);
  return registry?.bypass ?? runNow;
}

/** The names of the editors with unsaved changes, each once, in the order they reported. */
export function unsavedNames(editors: Iterable<UnsavedEditor>): string[] {
  return [...new Set([...editors].map((e) => e.name))];
}

/** Whether going from one address to another loses any of the editors' changes: another page loses them all, another
 *  address of the same page those of an editor that leaves the screen. */
export function losesChanges(editors: readonly UnsavedEditor[], from: Location, to: Location): boolean {
  if (!editors.length) return false;
  return from.pathname !== to.pathname || editors.some((e) => e.keeps?.(to) === false);
}

/** The page's side: the editors' names with unsaved changes, `report` for its UnsavedProvider, and `loses` for its
 *  leave guard. */
export function useUnsavedRegistry() {
  const editors = useRef(new Map<string, UnsavedEditor>());
  const [names, setNames] = useState<readonly string[]>([]);
  const report = useCallback((id: string, editor: UnsavedEditor | null) => {
    if (editor) editors.current.set(id, editor);
    else editors.current.delete(id);
    const next = unsavedNames(editors.current.values());
    setNames((prev) => (prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next));
  }, []);
  const loses = useCallback(
    (from: Location, to: Location) => losesChanges([...editors.current.values()], from, to),
    [],
  );
  return { names, report, loses };
}
