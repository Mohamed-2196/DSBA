// turnPushOff, resyncPush and onPushChanged against a stand-in browser (service worker, push manager, storage) and
// a stand-in API: no network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posts: string[] = [];
let failRemove = false;

vi.mock('../api/client', () => ({
  api: {
    GET: () => Promise.resolve({ publicKey: 'BA' }),
    POST: (path: string) => {
      posts.push(path);
      return failRemove && path.endsWith('/remove') ? Promise.reject(new Error('offline')) : Promise.resolve(undefined);
    },
  },
  call: (p: Promise<unknown>) => p,
}));

const { onPushChanged, resyncPush, turnPushOff } = await import('./push');

class Sub {
  endpoint = 'https://fcm.googleapis.com/fcm/send/x';
  options = { applicationServerKey: new Uint8Array([4]).buffer };
  unsubscribe = vi.fn(() => {
    browser.sub = null;
    return Promise.resolve(true);
  });
  toJSON = () => ({ endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } });
}

const browser: { sub: Sub | null; store: Map<string, string> } = { sub: null, store: new Map() };

beforeEach(() => {
  posts.length = 0;
  failRemove = false;
  browser.sub = null;
  browser.store = new Map();
  const pushManager = {
    getSubscription: () => Promise.resolve(browser.sub),
    subscribe: () => Promise.resolve((browser.sub = new Sub())),
  };
  vi.stubGlobal('window', { PushManager: class {}, Notification: class {}, matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Macintosh) Chrome/131.0.0.0',
    maxTouchPoints: 0,
    serviceWorker: { ready: Promise.resolve({ pushManager }) },
  });
  vi.stubGlobal('Notification', { permission: 'granted' });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => browser.store.get(k) ?? null,
    setItem: (k: string, v: string) => void browser.store.set(k, v),
    removeItem: (k: string) => void browser.store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resyncPush', () => {
  it('turns on by itself for the person who allowed them, or where nobody has', async () => {
    await resyncPush('u1');
    expect(posts).toEqual(['/api/v1/push/subscriptions']);
    expect(browser.store.get('dsba.push.owner')).toBe('u1');
    await resyncPush('u1');
    expect(posts).toHaveLength(2);
  });

  it('leaves a shared browser alone for the next person to sign in', async () => {
    browser.store.set('dsba.push.owner', 'u1');
    browser.sub = new Sub();
    await resyncPush('u2');
    expect(posts).toEqual([]);
    expect(browser.store.get('dsba.push.owner')).toBe('u1');
  });

  it('sends nothing when the device was turned off (in another tab) while the browser subscribed', async () => {
    const reg = await navigator.serviceWorker.ready;
    const subscribe = reg.pushManager.subscribe.bind(reg.pushManager);
    reg.pushManager.subscribe = () => {
      browser.store.set('dsba.push.off', '1');
      return subscribe();
    };
    await resyncPush('u1');
    expect(posts).toEqual([]);
  });
});

describe('turnPushOff', () => {
  it('marks the device off before it tells the API, and tells the switch', async () => {
    browser.store.set('dsba.push.owner', 'u1');
    browser.sub = new Sub();
    const changed = vi.fn();
    const stop = onPushChanged(changed);
    await turnPushOff();
    stop();
    expect(posts).toEqual(['/api/v1/push/subscriptions/remove']);
    expect(browser.store.get('dsba.push.off')).toBe('1');
    expect(browser.store.has('dsba.push.owner')).toBe(false);
    expect(browser.sub).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
  });

  it('stays on when the API couldn’t be told', async () => {
    browser.store.set('dsba.push.owner', 'u1');
    browser.sub = new Sub();
    failRemove = true;
    await expect(turnPushOff()).rejects.toThrow('offline');
    expect(browser.store.has('dsba.push.off')).toBe(false);
    expect(browser.store.get('dsba.push.owner')).toBe('u1');
    expect(browser.sub).not.toBeNull();
  });
});
