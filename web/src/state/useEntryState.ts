import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Where one page visit's state is kept: under its history entry, for this tab only. */
export const entryKey = (entryId: string, name: string): string => `hub.entry.${entryId}.${name}`;

function read(key: string): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? null : raw === '1';
  } catch {
    return null;
  }
}

/**
 * A yes/no a page remembers for its own visit (a list shown in full, a section opened): kept with the browser's
 * history entry, so Back to the page finds it as it was, while a fresh visit starts from `initial`. Lasts as long
 * as the tab.
 */
export function useEntryState(name: string, initial: boolean): [boolean, (next: boolean) => void] {
  const { key: entryId } = useLocation();
  const key = entryKey(entryId, name);
  const [state, setState] = useState<{ key: string; value: boolean }>(() => ({ key, value: read(key) ?? initial }));
  const value = state.key === key ? state.value : (read(key) ?? initial);
  const set = useCallback(
    (next: boolean) => {
      setState({ key, value: next });
      try {
        window.sessionStorage.setItem(key, next ? '1' : '0');
      } catch {
        /* storage unavailable: it lasts while the page is open */
      }
    },
    [key],
  );
  return [value, set];
}
