// The navigation this person sees: the items whose feature is on for them (visibility.ts), with "New" only on the
// sections they haven't opened yet in this browser (seen.ts). Opening a section's page marks it seen.
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLocalStorage } from '../state';
import { NAV, type NavItem } from './nav';
import { SEEN_KEY, asSeen, markSeen, navAt, withSeen } from './seen';
import { visibleNav } from './visibility';

export function useShownNav(): NavItem[] {
  const { featureOn, me } = useAuth();
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

  return useMemo(() => withSeen(visibleNav(NAV, featureOn, !!me), seen, account), [featureOn, me, seen, account]);
}
