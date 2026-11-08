import { describe, expect, it } from 'vitest';
import { installWay } from './pwa';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const MAC_SAFARI_17 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MAC_SAFARI_16 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAC_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';

const way = (userAgent: string, patch: { canPrompt?: boolean; installed?: boolean; touchPoints?: number } = {}) =>
  installWay({ canPrompt: false, installed: false, touchPoints: 0, userAgent, ...patch });

describe('installWay', () => {
  it('uses the browser’s prompt when it offers one', () => {
    expect(way(ANDROID, { canPrompt: true })).toBe('prompt');
    expect(way(FIREFOX, { canPrompt: true })).toBe('prompt');
  });

  it('explains the steps on an iPhone, and on an iPad that calls itself a Mac', () => {
    expect(way(IPHONE, { touchPoints: 5 })).toBe('iphone');
    expect(way(IPAD, { touchPoints: 5 })).toBe('iphone');
  });

  it('explains the steps on Android without a prompt', () => {
    expect(way(ANDROID, { touchPoints: 5 })).toBe('android');
  });

  it('explains File, Add to Dock in Safari 17 or later on a Mac', () => {
    expect(way(MAC_SAFARI_17)).toBe('mac');
    expect(way(MAC_SAFARI_17.replace('Version/17.0', 'Version/26.1'))).toBe('mac');
    expect(way(MAC_SAFARI_17, { installed: true })).toBeNull();
  });

  it('offers nothing once installed, or where the browser can’t install it', () => {
    expect(way(ANDROID, { canPrompt: true, installed: true })).toBeNull();
    expect(way(FIREFOX)).toBeNull();
    expect(way(MAC_FIREFOX)).toBeNull();
    expect(way(MAC_SAFARI_16)).toBeNull(); // Add to Dock came with Safari 17 (macOS Sonoma)
    expect(way(MAC_CHROME)).toBeNull(); // Chrome on a Mac installs through its own prompt, when it offers one
  });
});
