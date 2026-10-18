// UX-3: unsaved edits are never thrown away by a stray navigation. While `active`, every way of leaving the page
// inside the Hub (a link, the sidebar, a breadcrumb, a notification, the ⌘K palette, Back and Forward) is held until
// the rep says whether to leave (useBlocker: the app runs on a data router, see App.tsx), and reloading or closing
// the tab asks the browser's own question. The editor's own navigations, after saving or deleting, go through
// `bypass`: they leave nothing behind.
import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';

export interface LeaveGuard {
  /** a navigation is waiting for the rep's answer */
  asking: boolean;
  /** stay on the page */
  stay: () => void;
  /** go where the navigation wanted to (the edits stay unsaved; this device keeps a copy) */
  leave: () => void;
  /** run one of the editor's own navigations without asking */
  bypass: (go: () => void) => void;
}

export function useLeaveGuard(active: boolean): LeaveGuard {
  const passing = useRef(false);
  // Only another page asks, not an anchor on this one.
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      active &&
      !passing.current &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
    [active],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!active) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  // Saved (or discarded) while the question was open: nothing is left to lose, so the question goes away and the
  // rep stays; following the link again goes straight there.
  useEffect(() => {
    if (blocker.state === 'blocked' && !active) blocker.reset();
  }, [blocker, active]);

  const stay = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
  const leave = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker]);
  // The router asks the blocker while navigate() runs, so the flag only has to hold for the call.
  const bypass = useCallback((go: () => void) => {
    passing.current = true;
    try {
      go();
    } finally {
      passing.current = false;
    }
  }, []);

  return { asking: blocker.state === 'blocked', stay, leave, bypass };
}
