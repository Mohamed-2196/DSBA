import { describe, expect, it } from 'vitest';
import { cacheNames, overflow, parseManifest, routeFor, staleCaches } from './routes';

const ORIGIN = 'https://hub.example.com';
const get = (path: string, mode = 'cors') => ({ method: 'GET', url: path.startsWith('http') ? path : `${ORIGIN}${path}`, mode });

describe('routeFor', () => {
  it('never touches the API, whatever the request', () => {
    expect(routeFor(get('/api/v1/me'), ORIGIN)).toBe('network');
    expect(routeFor(get('/api/v1/media/abc.png', 'no-cors'), ORIGIN)).toBe('network');
    expect(routeFor(get('/api/v1/library/x', 'navigate'), ORIGIN)).toBe('network');
    expect(routeFor(get('/api'), ORIGIN)).toBe('network');
  });

  it('leaves other sites alone: the bucket’s file links, YouTube, analytics', () => {
    expect(routeFor(get('https://dsba-hub.s3.eu-central-1.amazonaws.com/f.pdf?X-Amz-Signature=1'), ORIGIN)).toBe('network');
    expect(routeFor(get('https://i.ytimg.com/vi/x/hq.jpg', 'no-cors'), ORIGIN)).toBe('network');
  });

  it('only handles GET', () => {
    expect(routeFor({ method: 'POST', url: `${ORIGIN}/assets/a.js`, mode: 'cors' }, ORIGIN)).toBe('network');
  });

  it('serves page loads network first with the shell behind them', () => {
    expect(routeFor(get('/', 'navigate'), ORIGIN)).toBe('shell');
    expect(routeFor(get('/forum/some-thread?x=1', 'navigate'), ORIGIN)).toBe('shell');
  });

  it('keeps built files and public images', () => {
    expect(routeFor(get('/assets/index-abc.js'), ORIGIN)).toBe('asset');
    expect(routeFor(get('/brand/hub-icon.png', 'no-cors'), ORIGIN)).toBe('static');
    expect(routeFor(get('/logos/employers/bbk.png', 'no-cors'), ORIGIN)).toBe('static');
    expect(routeFor(get('/favicon.png', 'no-cors'), ORIGIN)).toBe('static');
    expect(routeFor(get('/illustrations/empty-offline.png', 'no-cors'), ORIGIN)).toBe('static');
  });

  it('leaves the worker and the manifest to the browser', () => {
    expect(routeFor(get('/sw.js'), ORIGIN)).toBe('network');
    expect(routeFor(get('/manifest.webmanifest'), ORIGIN)).toBe('network');
  });

  it('treats a bad address as none of its business', () => {
    expect(routeFor({ method: 'GET', url: 'not a url', mode: 'cors' }, ORIGIN)).toBe('network');
  });
});

describe('caches', () => {
  it('drops other builds’ shells and keeps the shared caches and other sites’ caches', () => {
    const names = ['dsba-shell-old', 'dsba-shell-new', 'dsba-assets', 'dsba-static', 'someone-else'];
    expect(staleCaches(names, 'new')).toEqual(['dsba-shell-old']);
    expect(cacheNames('new').shell).toBe('dsba-shell-new');
  });

  it('trims the oldest entries past the limit', () => {
    expect(overflow([1, 2, 3, 4], 2)).toEqual([1, 2]);
    expect(overflow([1, 2], 5)).toEqual([]);
  });
});

describe('parseManifest', () => {
  it('reads what the build wrote', () => {
    expect(parseManifest('{"version":"abc","precache":["/","/assets/a.js"]}')).toEqual({ version: 'abc', precache: ['/', '/assets/a.js'] });
  });

  it('refuses the placeholder, bad JSON and API paths', () => {
    expect(parseManifest('__DSBA_SW_MANIFEST__')).toBeNull();
    expect(parseManifest('{"version":"","precache":[]}')).toBeNull();
    expect(parseManifest('{"version":"v","precache":["/api/v1/me","https://x.com/a","/ok.js",3]}')).toEqual({ version: 'v', precache: ['/ok.js'] });
  });
});
