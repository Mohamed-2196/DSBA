// Why a page failed to show. Pure, so it is unit-tested.

/** The browser couldn't fetch the page's code (a lazy chunk): what Chrome, Firefox and Safari say, and Vite's preload. */
const CHUNK_FAILED =
  /dynamically imported module|importing a module script failed|error loading dynamically imported|loading (css )?chunk|unable to preload css/i;

/**
 * The page's code couldn't be fetched: offline, a page never opened on this device has none kept (ST-70). React
 * keeps a lazy page's failed import, so only a reload fetches it again.
 */
export function codeMissing(error: unknown): boolean {
  return error instanceof Error && CHUNK_FAILED.test(error.message);
}
