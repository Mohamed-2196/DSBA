// The hub's service worker, built to /sw.js by the build (vite.config.ts, serviceWorker()), which also writes in its
// manifest: the build's version and the files every page needs (index.html, the entry script and its styles).
// What it keeps and what it leaves alone is in routes.ts. It never keeps an API answer: what a student last read is
// kept by the app itself, per account, for reading offline (src/api/offline.ts).
//
// A new build installs beside the running one and waits; the page offers "Reload" (shell/UpdatePrompt.tsx), which
// sends SKIP_WAITING, and the page reloads once the new worker is in charge.
import { CACHE_LIMITS, cacheNames, overflow, parseManifest, routeFor, staleCaches } from './routes';

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface ExtendableMessageEvent extends ExtendableEvent {
  readonly data: unknown;
}
interface WorkerScope {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: ExtendableMessageEvent) => void): void;
}
declare const self: WorkerScope;

// The build replaces the placeholder with the manifest's JSON.
const manifest = parseManifest('__DSBA_SW_MANIFEST__');
const version = manifest?.version ?? 'dev';
const CACHES = cacheNames(version);
const SHELL = '/';

/** Keep a response only when it is a whole, same-origin, successful one. */
const keepable = (res: Response): boolean => res.ok && res.type === 'basic' && res.status === 200;

async function precache(): Promise<void> {
  if (!manifest) return;
  const cache = await caches.open(CACHES.shell);
  // cache: 'reload' skips the HTTP cache, so the shell is this build's and not one the browser kept.
  await cache.addAll(manifest.precache.map((path) => new Request(path, { cache: 'reload' })));
}

async function trim(name: string, limit: number): Promise<void> {
  const cache = await caches.open(name);
  const old = overflow(await cache.keys(), limit);
  await Promise.all(old.map((req) => cache.delete(req)));
}

async function cleanUp(): Promise<void> {
  await Promise.all(staleCaches(await caches.keys(), version).map((name) => caches.delete(name)));
  await Promise.all([trim(CACHES.assets, CACHE_LIMITS.assets), trim(CACHES.static, CACHE_LIMITS.static)]);
}

/** A page load: always the network when it answers (so a new build shows up), else the cached shell. */
async function shell(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(SHELL, { cacheName: CACHES.shell });
    if (cached) return cached;
    throw error;
  }
}

/** A built file: from any cache that has it, else the network (and kept for next time). */
async function asset(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (keepable(res)) {
    const copy = res.clone();
    void caches.open(CACHES.assets).then((cache) => cache.put(request, copy));
  }
  return res;
}

/** A public image or icon: the kept copy at once, refreshed behind it; the network when there is none. */
async function staticFile(request: Request, event: FetchEvent): Promise<Response> {
  const cache = await caches.open(CACHES.static);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (res) => {
    if (keepable(res)) await cache.put(request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  // Offline and never kept here: the shell's precached copy (the offline spot), if there is one.
  try {
    return await refresh;
  } catch (error) {
    const kept = await caches.match(request);
    if (kept) return kept;
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanUp());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && typeof data === 'object' && (data as { type?: unknown }).type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const route = routeFor(request, self.location.origin);
  if (route === 'shell') event.respondWith(shell(request));
  else if (route === 'asset') event.respondWith(asset(request));
  else if (route === 'static') event.respondWith(staticFile(request, event));
  // 'network': no respondWith, so the browser handles the request exactly as it would without a worker.
});
