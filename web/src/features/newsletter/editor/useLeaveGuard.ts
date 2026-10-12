// UX-3: unsaved edits are never thrown away by a stray click. While `active`, reloading or closing the tab asks the
// browser's own question, and a click on any link of the Hub (the sidebar, a breadcrumb, a notification) is held
// until the rep says whether to leave. (The app uses BrowserRouter, which has no useBlocker: links are caught in the
// capture phase, before React Router's Link sees them.)
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/** The route of a link of this app, as React Router takes it (without the app's base path), or null. */
function routeOf(anchor: HTMLAnchorElement): string | null {
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // A link to this very page (an anchor on it) doesn't leave the editor.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const path = base && url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : url.pathname;
  return `${path}${url.search}${url.hash}`;
}

export interface LeaveGuard {
  /** where a held click wanted to go; the editor asks the rep while it is set */
  pending: string | null;
  /** stay on the page */
  stay: () => void;
  /** go where the click wanted to (the edits stay unsaved) */
  leave: () => void;
}

export function useLeaveGuard(active: boolean): LeaveGuard {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    const onClick = (e: MouseEvent) => {
      // Let the browser open links in a new tab or window as usual: nothing is lost.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const route = routeOf(anchor);
      if (!route) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(route);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [active]);

  const stay = useCallback(() => setPending(null), []);
  const leave = useCallback(() => {
    setPending(null);
    if (pending) navigate(pending);
  }, [pending, navigate]);

  return { pending, stay, leave };
}
