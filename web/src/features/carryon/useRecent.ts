// The recent visits (recent.ts) of the person using this browser: their account's list, or a guest's.
import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../../auth';
import { useLocalStorage } from '../../state';
import { cleanVisits, recentKey, sameVisit, withVisit, withoutVisit, type Visit } from './recent';

export function useRecent() {
  const { me, status } = useAuth();
  const account = status === 'signed-in' ? (me?.id ?? null) : null;
  const [raw, setRaw] = useLocalStorage<unknown>(recentKey(account), []);
  const visits = useMemo(() => cleanVisits(raw), [raw]);
  const record = useCallback(
    (visit: Visit) =>
      setRaw((prev: unknown) => {
        const list = cleanVisits(prev);
        // Opened again within a minute, with nothing new to say: leave it (no write on every re-render).
        if (sameVisit(list[0], visit) && visit.at - list[0].at < 60_000) return prev;
        return withVisit(list, visit);
      }),
    [setRaw],
  );
  const forget = useCallback(
    (gone: Pick<Visit, 'kind' | 'id'>) => setRaw((prev: unknown) => withoutVisit(cleanVisits(prev), gone)),
    [setRaw],
  );
  const clear = useCallback(() => setRaw(undefined), [setRaw]);
  return { visits, record, forget, clear, ready: status !== 'loading' };
}

export type VisitInput = Omit<Visit, 'at'>;

/** Notes that `visit` was opened, once it is known (null: nothing to record yet). */
export function useRecordVisit(visit: VisitInput | null): void {
  const { record, ready } = useRecent();
  const { kind, id, path, title, moduleId, onItem } = visit ?? {};
  useEffect(() => {
    if (!ready || !kind || !id || !path || !title) return;
    record({ kind, id, path, title, moduleId: moduleId ?? null, onItem: onItem ?? null, at: Date.now() });
  }, [ready, record, kind, id, path, title, moduleId, onItem]);
}
