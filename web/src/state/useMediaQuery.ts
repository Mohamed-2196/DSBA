import { useCallback, useSyncExternalStore } from 'react';

/** true while the media query matches, e.g. useMediaQuery('(max-width: 699px)'). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Shell breakpoints: mobile < 700, tablet 700–1099 (icon rail), desktop ≥ 1100. */
export const BREAKPOINTS = {
  mobile: '(max-width: 699px)',
  tablet: '(min-width: 700px) and (max-width: 1099px)',
  desktop: '(min-width: 1100px)',
} as const;
