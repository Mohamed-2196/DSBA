// Notifications on this device (web push). The API sends them (app/services/push.py); the service worker shows them
// (sw/sw.ts). This file turns them on and off for this browser and keeps the API's record of it current.
//
//   pushSupport()        whether this browser can get them: yes, not until the app is on the Home Screen (iPhone
//                        and iPad), or no
//   turnPushOn(userId)   asks the browser's permission (call it from a tap, never on load), subscribes with the Hub's
//                        key and tells the API. Throws PushRefused when the person (or the browser) says no
//   turnPushOff()        tells the API, then ends the browser's subscription
//   devicePushOn()       whether this browser has a subscription the signed-in person made
//   resyncPush(userId)   on start: sends the subscription again (its session is the current one; a renewed
//                        subscription replaces the old), or ends one another person made on this browser
//   setAppBadge(count)   the app icon's badge: the unread count while the app is open (the service worker sets it
//                        when a push comes); nothing where the browser has no badges
import { api, call } from '../api/client';

export type PushSupport = 'yes' | 'home-screen' | 'no';

const OWNER_KEY = 'dsba.push.owner'; // the account the browser's subscription is for

export class PushRefused extends Error {
  constructor(readonly blocked: boolean) {
    super(blocked ? 'Notifications are blocked for the Hub in this browser.' : 'Notifications weren’t allowed.');
  }
}

/** iPhone and iPad (an iPad says it is a Mac; its touch screen gives it away). */
export const isAppleMobile = (userAgent: string, touchPoints: number): boolean =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1);

/**
 * Whether this browser can get push: iPhone and iPad only from the app on the Home Screen (iOS 16.4 or later), the
 * others wherever they have a service worker and push.
 */
export function pushSupport({
  userAgent,
  touchPoints,
  standalone,
  hasPush,
}: {
  userAgent: string;
  touchPoints: number;
  standalone: boolean;
  hasPush: boolean;
}): PushSupport {
  if (isAppleMobile(userAgent, touchPoints) && !standalone) return 'home-screen';
  return hasPush ? 'yes' : 'no';
}

function standalone(): boolean {
  try {
    return (
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  } catch {
    return false;
  }
}

/** This browser's support, read from the browser. */
export function browserPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'no';
  return pushSupport({
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints ?? 0,
    standalone: standalone(),
    hasPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  });
}

/** The browser's permission for the Hub's notifications. */
export function pushPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'denied' : Notification.permission;
}

/** The worker's registration, once it is running (startPwa registers it in a production build). */
async function registration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  const ready = navigator.serviceWorker.ready;
  const late = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error('The Hub’s offline helper isn’t running, so notifications can’t start.')),
      timeoutMs,
    ),
  );
  return Promise.race([ready, late]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (browserPushSupport() !== 'yes') return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/** base64url to the bytes PushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The parts of a PushSubscription the API keeps. */
export function subscriptionBody(sub: PushSubscriptionJSON): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const { endpoint, keys } = sub;
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error('This browser gave no notification keys.');
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

function owner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function setOwner(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // private browsing: the subscription works, it just isn't re-sent on the next start
  }
}

/** Whether a subscription was made with this VAPID key. A new key on the API makes every older subscription useless
 * (its push service refuses the hub's messages), so such a browser subscribes again. */
export function sameKey(subscribedWith: ArrayBuffer | null, key: Uint8Array): boolean {
  if (!subscribedWith || subscribedWith.byteLength !== key.byteLength) return false;
  const bytes = new Uint8Array(subscribedWith);
  return bytes.every((b, i) => b === key[i]);
}

/** This browser's subscription for `userId` with the API's current key: kept, or made again when it was someone
 * else's or made with an older key. */
async function subscription(reg: ServiceWorkerRegistration, userId: string): Promise<PushSubscription> {
  const { publicKey } = await call(api.GET('/api/v1/push/key'));
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && (owner() !== userId || !sameKey(sub.options.applicationServerKey, key))) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  return sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
}

async function send(sub: PushSubscription): Promise<void> {
  await call(api.POST('/api/v1/push/subscriptions', { body: subscriptionBody(sub.toJSON()) }));
}

export async function turnPushOn(userId: string): Promise<void> {
  if (pushPermission() === 'denied') throw new PushRefused(true);
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushRefused(permission === 'denied');
  const sub = await subscription(await registration(), userId);
  await send(sub);
  setOwner(userId);
}

export async function turnPushOff(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    await call(api.POST('/api/v1/push/subscriptions/remove', { body: { endpoint: sub.endpoint } }));
    await sub.unsubscribe().catch(() => undefined);
  }
  setOwner(null);
}

export async function devicePushOn(userId: string): Promise<boolean> {
  if (pushPermission() !== 'granted' || owner() !== userId) return false;
  return (await currentSubscription()) !== null;
}

export async function resyncPush(userId: string): Promise<void> {
  if (browserPushSupport() !== 'yes' || pushPermission() !== 'granted') return;
  const sub = await currentSubscription();
  if (!sub) {
    if (owner() === userId) setOwner(null);
    return;
  }
  if (owner() !== userId) {
    await sub.unsubscribe().catch(() => undefined); // the last person on this browser turned it on, not this one
    setOwner(null);
    return;
  }
  await send(await subscription(await registration(), userId)); // a new subscription when the API's key changed
}

/** The app icon's badge: the unread count, or none at 0. Badges are a nicety: a browser without them is fine. */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    void done?.catch(() => undefined);
  } catch {
    // no badges here
  }
}
