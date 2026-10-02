import { useCallback, useMemo } from 'react';
import { useLocalStorage } from '../../../state';

const KEY = 'hub.library.starred';

/** Starred files (per viewer, localStorage). { starred: Set<id>, isStarred(id), toggle(id) → nowStarred } */
export function useStarred() {
  const [ids, setIds] = useLocalStorage(KEY, []);
  const starred = useMemo(() => new Set(Array.isArray(ids) ? ids : []), [ids]);
  const isStarred = useCallback((id) => starred.has(id), [starred]);
  const toggle = useCallback(
    (id) => {
      const next = !starred.has(id);
      setIds((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
      });
      return next;
    },
    [setIds, starred],
  );
  return { starred, isStarred, toggle };
}
