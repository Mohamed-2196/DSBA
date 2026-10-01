import { useEffect } from 'react';

/**
 * Set the tab title for a page, e.g. useDocumentTitle(module.name) → "Mathematical Methods – DSBA Pulse".
 * The route table sets a default per route; this overrides it. Pass null to keep the default.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} – DSBA Pulse`;
  }, [title]);
}
