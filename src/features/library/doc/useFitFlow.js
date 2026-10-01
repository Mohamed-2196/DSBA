import { useLayoutEffect } from 'react';

/**
 * Pagination-lite for mock pages: children of the flow container that would overflow the page are
 * hidden (with everything after them), so a page never shows a half-cut block. A heading left
 * alone at the bottom is hidden too. Re-runs once web fonts finish loading.
 */
export function useFitFlow(ref, key) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let cancelled = false;
    const fit = () => {
      if (cancelled || !el.isConnected) return;
      const kids = Array.from(el.children);
      for (const k of kids) k.removeAttribute('data-overflow');
      const limit = el.clientHeight + 0.5;
      let cut = kids.length;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (k.offsetTop + k.offsetHeight > limit) {
          cut = i;
          break;
        }
      }
      while (cut > 1 && kids[cut - 1].hasAttribute('data-keep-next')) cut -= 1;
      for (let i = cut; i < kids.length; i++) kids[i].setAttribute('data-overflow', '');
    };
    fit();
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    fonts?.ready?.then(fit);
    fonts?.addEventListener?.('loadingdone', fit);
    return () => {
      cancelled = true;
      fonts?.removeEventListener?.('loadingdone', fit);
    };
  }, [ref, key]);
}
