// The installed app: the service worker (src/sw/sw.ts, built to /sw.js) and the browser's install prompt.
//
//   startPwa()            main.tsx, once: listens for the install prompt and, in a production build, registers the
//                         worker. The worker keeps the app shell and built files only, never API answers
//                         (the app keeps what was read for offline reading itself: api/offline.ts).
//   useUpdateReady()      true once a new build is installed and waiting (shell/UpdatePrompt.tsx offers "Reload")
//   applyUpdate()         hands over to the waiting build; the page reloads when it takes charge
//   useInstall()          { canPrompt, installed, prompt }: "Install the app" where the browser offers it (Chrome,
//                         Edge, Android); iPhone and iPad have no prompt, so pages explain Share, Add to Home Screen.
//   installWay()          how this device installs the app: the browser's prompt, or the steps for an iPhone or
//                         Android; null where it is installed or can't be (shell/InstallApp.tsx offers it)
import { useSyncExternalStore } from 'react';

/** The event Chrome and Edge fire when the app can be installed (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isInstallPrompt = (e: Event): e is InstallPromptEvent =>
  'prompt' in e && typeof (e as { prompt?: unknown }).prompt === 'function';

interface PwaState {
  waiting: ServiceWorker | null;
  installPrompt: InstallPromptEvent | null;
  installed: boolean;
}

let state: PwaState = { waiting: null, installPrompt: null, installed: false };
const listeners = new Set<() => void>();

function setState(patch: Partial<PwaState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the page runs as the installed app (home screen or desktop window). */
function runningInstalled(): boolean {
  try {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** Watch a registration for a new build that finishes installing while this one runs the page. */
function watch(reg: ServiceWorkerRegistration): void {
  const offer = (worker: ServiceWorker | null) => {
    // With no controller this is the first install: nothing to replace, so nothing to offer.
    if (worker && navigator.serviceWorker.controller) setState({ waiting: worker });
  };
  offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    if (!next) return;
    next.addEventListener('statechange', () => {
      if (next.state === 'installed') offer(next);
    });
  });
}

let started = false;

export function startPwa(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  setState({ installed: runningInstalled() });
  window.addEventListener('beforeinstallprompt', (e) => {
    if (!isInstallPrompt(e)) return;
    e.preventDefault(); // the hub offers it where it fits, not as a browser banner
    setState({ installPrompt: e });
  });
  window.addEventListener('appinstalled', () => setState({ installPrompt: null, installed: true }));

  // Only a production build at the site's root has a worker (vite.config.ts builds it to /sw.js).
  if (!import.meta.env.PROD || import.meta.env.BASE_URL !== '/' || !('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !state.waiting) return; // reload only for an update the student asked for
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        watch(reg);
        // Look for a new build when the student comes back to the tab, at most once an hour.
        let checked = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - checked < 60 * 60_000) return;
          checked = Date.now();
          void reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined); // without a worker the app works exactly the same, just not offline
  });
}

/** Switch to the waiting build: it takes charge, and the page reloads (startPwa's controllerchange). */
export function applyUpdate(): void {
  state.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.waiting !== null,
    () => false,
  );
}

export interface InstallState {
  /** the browser can show its install dialog now */
  canPrompt: boolean;
  /** this page is the installed app */
  installed: boolean;
  /** show the browser's install dialog; true when the student installed it */
  prompt: () => Promise<boolean>;
}

async function promptInstall(): Promise<boolean> {
  const e = state.installPrompt;
  if (!e) return false;
  setState({ installPrompt: null }); // a prompt can be shown only once
  try {
    await e.prompt();
    return (await e.userChoice).outcome === 'accepted';
  } catch {
    return false;
  }
}

const getCanPrompt = () => state.installPrompt !== null;
const getInstalled = () => state.installed;

export function useInstall(): InstallState {
  const canPrompt = useSyncExternalStore(subscribe, getCanPrompt, () => false);
  const installed = useSyncExternalStore(subscribe, getInstalled, () => false);
  return { canPrompt, installed, prompt: promptInstall };
}

export type InstallWay = 'prompt' | 'iphone' | 'android';

/**
 * How this device installs the app: the browser's own prompt when it offers one, else the steps for an iPhone or
 * iPad (Safari has no prompt) or for Android; null when it is installed already or the browser can't install it
 * (desktop Firefox and Safari).
 */
export function installWay({
  canPrompt,
  installed,
  userAgent,
  touchPoints,
}: {
  canPrompt: boolean;
  installed: boolean;
  userAgent: string;
  touchPoints: number;
}): InstallWay | null {
  if (installed) return null;
  if (canPrompt) return 'prompt';
  // iPadOS reports itself as a Mac; its touch screen gives it away.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'iphone';
  if (/Android/.test(userAgent)) return 'android';
  return null;
}
