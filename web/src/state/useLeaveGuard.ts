// Unsaved edits are never thrown away by a stray navigation. While `active`, every way of leaving inside the hub (a
// link, the sidebar, a breadcrumb, a notification, the ⌘K palette, Back and Forward) waits until the person says
// whether to leave (useBlocker: the app runs on a data router, see App.tsx), and reloading or closing the tab asks the
// browser's own question. React Router holds one blocker at a time, so a page with several editors has one guard
// (Manage's, fed by state/unsaved.ts). An editor's own navigations, after saving or deleting, go through `bypass`.
import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction, type Location } from 'react-router-dom';

export interface LeaveGuard {
  /** a navigation is waiting for the answer */
  asking: boolean;
  /** stay on the page */
  stay: () => void;
  /** go where the navigation wanted to (the edits stay unsaved) */
  leave: () => void;
  /** run one of the editor's own navigations without asking */
  bypass: (go: () => void) => void;
}

/** Whether going from one address to another loses the edits. */
export type Loses = (from: Location, to: Location) => boolean;

/** Another page loses them, not an anchor on this one. */
const toAnotherPage: Loses = (from, to) => from.pathname !== to.pathname || from.search !== to.search;

export function useLeaveGuard(active: boolean, loses: Loses = toAnotherPage): LeaveGuard {
  const passing = useRef(false);
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => active && !passing.current && loses(currentLocation, nextLocation),
    [active, loses],
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
  // person stays; following the link again goes straight there.
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
