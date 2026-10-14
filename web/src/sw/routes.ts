// What the service worker (sw.ts) does with each request. Plain functions, so the rules are unit-tested.
//
// It keeps only what is the same for everyone: the app shell (index.html), the built files under /assets/ (their
// names change with their content) and the public images and icons. Everything else goes to the network untouched:
// the API (personal data, sessions), other sites (the bucket's short-lived file links, YouTube, analytics) and
// every request that isn't a GET.

export type SwRoute =
  /** a page load: the network first, the cached shell when offline */
  | 'shell'
  /** a built file: the cache first (it never changes under the same name) */
  | 'asset'
  /** a public image or icon: the cache at once, refreshed from the network behind it */
  | 'static'
  /** not the worker's business */
  | 'network';

export interface SwRequest {
  method: string;
  url: string;
  mode: string;
}

/** Public folders and files under the app's root that are safe to keep (web/public). */
const STATIC_PREFIXES = ['/brand/', '/icons/', '/logos/', '/noora/', '/illustrations/', '/demo/'];
const STATIC_FILES = new Set(['/favicon.png', '/hub.svg']);

export function routeFor(req: SwRequest, origin: string): SwRoute {
  if (req.method !== 'GET') return 'network';
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return 'network';
  }
  if (url.origin !== origin) return 'network';
  const path = url.pathname;
  if (path === '/api' || path.startsWith('/api/')) return 'network';
  if (req.mode === 'navigate') return 'shell';
  if (path.startsWith('/assets/')) return 'asset';
  if (STATIC_FILES.has(path) || STATIC_PREFIXES.some((p) => path.startsWith(p))) return 'static';
  return 'network';
}

/** Cache names for one build: the shell is per build, built files and public images are shared between builds. */
export function cacheNames(version: string) {
  return { shell: `dsba-shell-${version}`, assets: 'dsba-assets', static: 'dsba-static' } as const;
}

/** The caches an activating worker deletes: other builds' shells and anything that isn't the hub's. */
export function staleCaches(existing: readonly string[], version: string): string[] {
  const keep = new Set<string>(Object.values(cacheNames(version)));
  return existing.filter((name) => name.startsWith('dsba-') && !keep.has(name));
}

/** How many entries each shared cache keeps (the oldest go first), so old builds' files don't pile up. */
export const CACHE_LIMITS = { assets: 300, static: 120 } as const;

/** The oldest keys past `limit` (Cache.keys() lists them oldest first). */
export function overflow<T>(keys: readonly T[], limit: number): T[] {
  return keys.length > limit ? keys.slice(0, keys.length - limit) : [];
}

/** What the build writes into sw.js: its version and the files to keep from the start. */
export interface SwManifest {
  version: string;
  precache: string[];
}

/** The manifest as the build wrote it, or null when it's missing or malformed (the worker then keeps nothing). */
export function parseManifest(raw: string): SwManifest | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    const { version, precache } = v as Record<string, unknown>;
    if (typeof version !== 'string' || !version || !Array.isArray(precache)) return null;
    const files = precache.filter((p): p is string => typeof p === 'string' && p.startsWith('/') && !p.startsWith('/api/'));
    return { version, precache: files };
  } catch {
    return null;
  }
}
