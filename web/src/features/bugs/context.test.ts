import { describe, expect, it } from 'vitest';
import { browserOf, pageOf } from './context';

const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const WIN_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';

describe('browserOf', () => {
  it('names the browser, its version and the system', () => {
    expect(browserOf(MAC_CHROME, 1440, 900)).toBe('Chrome 141 on macOS, 1440×900');
    expect(browserOf(IPHONE_SAFARI)).toBe('Safari 18 on iOS');
    expect(browserOf(WIN_EDGE)).toBe('Edge 141 on Windows');
  });
  it('falls back to the user agent', () => {
    expect(browserOf('SomeBot/1.0')).toBe('SomeBot/1.0');
  });
});

describe('pageOf', () => {
  it('keeps the path and query, not the hash', () => {
    expect(pageOf({ pathname: '/library', search: '?q=mgf' })).toBe('/library?q=mgf');
    expect(pageOf({ pathname: '', search: '' })).toBe('/');
  });
});
