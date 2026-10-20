/**
 * Runs `work` once the page has settled (the browser is idle, or after two seconds at most), so Noora's extras never
 * compete with the page's own files. Returns the cancel, for an effect's cleanup.
 */
export function afterSettling(work: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(work, 800);
  return () => window.clearTimeout(id);
}
