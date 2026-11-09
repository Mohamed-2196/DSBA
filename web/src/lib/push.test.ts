import { describe, expect, it } from 'vitest';
import { keyBytes, pushSupport, sameKey, subscriptionBody } from './push';

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
