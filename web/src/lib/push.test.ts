import { describe, expect, it } from 'vitest';
import { blockedNote, keyBytes, offerPush, pushOnStart, pushSupport, sameKey, subscriptionBody } from './push';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const support = (userAgent: string, patch: { touchPoints?: number; standalone?: boolean; hasPush?: boolean } = {}) =>
  pushSupport({ userAgent, touchPoints: 0, standalone: false, hasPush: true, ...patch });

describe('pushSupport', () => {
  it('asks iPhone and iPad users to add the Hub to the Home Screen first', () => {
    expect(support(IPHONE, { touchPoints: 5, hasPush: false })).toBe('home-screen');
    expect(support(IPAD, { touchPoints: 5 })).toBe('home-screen');
  });

  it('works on the Home Screen app, and wherever the browser has push', () => {
    expect(support(IPHONE, { touchPoints: 5, standalone: true })).toBe('yes');
    expect(support(CHROME)).toBe('yes');
    expect(support(IPAD)).toBe('yes'); // a real Mac (no touch screen): Safari has push
  });

  it('says no where the browser has no push', () => {
    expect(support(CHROME, { hasPush: false })).toBe('no');
    expect(support(IPHONE, { touchPoints: 5, standalone: true, hasPush: false })).toBe('no');
  });
});

describe('keyBytes', () => {
  it('reads base64url without padding', () => {
    expect(Array.from(keyBytes('-_8'))).toEqual([0xfb, 0xff]);
    expect(
      keyBytes('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
    ).toHaveLength(65);
  });
});

describe('subscriptionBody', () => {
  it('keeps the endpoint and keys only', () => {
    expect(
      subscriptionBody({
        endpoint: 'https://fcm.googleapis.com/x',
        expirationTime: null,
        keys: { p256dh: 'a', auth: 'b' },
      }),
    ).toEqual({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } });
  });

  it('refuses a subscription with no keys', () => {
    expect(() => subscriptionBody({ endpoint: 'https://fcm.googleapis.com/x' })).toThrow();
  });
});

describe('sameKey', () => {
  const key = keyBytes('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4');

  it('keeps a subscription made with the current key', () => {
    expect(sameKey(key.slice().buffer, key)).toBe(true);
  });

  it('makes it again when the key changed, or the browser does not say', () => {
    const other = key.slice();
    other[10] ^= 1;
    expect(sameKey(other.buffer, key)).toBe(false);
    expect(sameKey(key.slice(1).buffer, key)).toBe(false);
    expect(sameKey(null, key)).toBe(false);
  });
});

describe('pushOnStart', () => {
  it('turns a device on by itself where its browser already allows the Hub’s notifications', () => {
    expect(pushOnStart({ support: 'yes', permission: 'granted', turnedOffHere: false })).toBe(true);
  });

  it('leaves it off where someone turned it off here, or the browser hasn’t allowed them', () => {
    expect(pushOnStart({ support: 'yes', permission: 'granted', turnedOffHere: true })).toBe(false);
    expect(pushOnStart({ support: 'yes', permission: 'default', turnedOffHere: false })).toBe(false);
    expect(pushOnStart({ support: 'yes', permission: 'denied', turnedOffHere: false })).toBe(false);
    expect(pushOnStart({ support: 'home-screen', permission: 'granted', turnedOffHere: false })).toBe(false);
    expect(pushOnStart({ support: 'no', permission: 'granted', turnedOffHere: false })).toBe(false);
  });
});

describe('offerPush', () => {
  const first = {
    installed: true,
    support: 'yes',
    permission: 'default',
    offered: false,
    turnedOffHere: false,
  } as const;

  it('offers once, in the installed app, before the device has been asked', () => {
    expect(offerPush(first)).toBe(true);
  });

  it('never offers again, nor in a browser tab, nor once the device has answered', () => {
    expect(offerPush({ ...first, offered: true })).toBe(false);
    expect(offerPush({ ...first, installed: false })).toBe(false);
    expect(offerPush({ ...first, permission: 'granted' })).toBe(false);
    expect(offerPush({ ...first, permission: 'denied' })).toBe(false);
    expect(offerPush({ ...first, turnedOffHere: true })).toBe(false);
    expect(offerPush({ ...first, support: 'no' })).toBe(false);
  });
});

describe('blockedNote', () => {
  it('sends the installed app to the device’s settings, and a tab to the browser’s', () => {
    expect(blockedNote(true)).toBe(
      'Notifications are blocked for the Hub on this device. Allow them in your device’s settings for the Hub app, then turn this on.',
    );
    expect(blockedNote(false)).toBe(
      'Notifications are blocked for the Hub in this browser. Allow them in the browser’s settings for this site, then turn this on.',
    );
  });
});
