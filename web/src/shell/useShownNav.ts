// The navigation this person sees: the items whose feature is on for them (visibility.ts), with "New" only on the
// sections they haven't opened yet in this browser (seen.ts). Opening a section's page marks it seen.
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLocalStorage } from '../state';
import { NAV, type NavItem } from './nav';
import { SEEN_KEY, asSeen, markSeen, navAt, withSeen } from './seen';
import { SHOWN_NAV_KEY, loadingNav, rememberedNav, visibleNav } from './visibility';

export function useShownNav(): NavItem[] {
  const { featureOn, me, status } = useAuth();
  const [shownBefore, setShownBefore] = useLocalStorage<unknown>(SHOWN_NAV_KEY, null);
  const loading = status === 'loading';
  const { pathname } = useLocation();
  const [stored, setStored] = useLocalStorage<unknown>(SEEN_KEY, {});
  const seen = useMemo(() => asSeen(stored), [stored]);
  const account = me?.id ?? null;

  const here = navAt(NAV, pathname);
  const hereId = here?.isNew ? here.id : null;
  useEffect(() => {
    if (!hereId) return;
    setStored((prev: unknown) => {
      const before = asSeen(prev);
      const after = markSeen(before, account, hereId);
      return after === before ? prev : after;
    });
  }, [hereId, account, setStored]);

  const items = useMemo(
    () => (loading ? loadingNav(NAV, rememberedNav(shownBefore)) : visibleNav(NAV, featureOn, !!me)),
    [loading, shownBefore, featureOn, me],
  );
  // Remember what is shown, for the next cold start.
  const ids = loading ? null : items.map((n) => n.id).join(',');
  useEffect(() => {
    if (ids === null) return;
    setShownBefore((prev: unknown) => (rememberedNav(prev)?.join(',') === ids ? prev : ids ? ids.split(',') : []));
  }, [ids, setShownBefore]);

  return useMemo(() => withSeen(items, seen, account), [items, seen, account]);
}
