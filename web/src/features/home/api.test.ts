import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeOut } from '../../api/types';

// The API client captures fetch when it is created and needs an origin outside a browser: set them up before it loads.
const net = vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://hub.test');
  const state = {
    requests: [] as string[],
    answer: (path: string): Response => new Response(JSON.stringify({ path }), { status: 200 }),
  };
  Object.assign(globalThis, {
    document: { cookie: '' },
    fetch: async (input: Request) => {
      const url = new URL(input.url, 'http://hub.test');
      state.requests.push(url.pathname + url.search);
      return state.answer(url.pathname);
    },
  });
  return state;
});

import { GUIDES_KEY, PAPER_CHOICES_KEY, SITE_KEY } from '../../api/keys';
import { homeKey, homeQuery, prefetchHome, seedFromHome, storedHomeParams } from './api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const HOME = {
  site: { tagline: 'Made by students' },
  choices: [{ kind: 'option', year: 2, pick: 1, options: [] }],
  guides: null,
  resultsDay: null,
  dates: [],
  nextExam: null,
  dailyQuestion: null,
  shelf: { newFiles: 3, notes: null },
} as unknown as HomeOut;

let local: Map<string, string>;
let session: Map<string, string>;
const storage = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, v),
});

beforeEach(() => {
  local = new Map();
  session = new Map();
  vi.stubGlobal('window', { localStorage: storage(local), sessionStorage: storage(session) });
  net.requests = [];
  net.answer = (path) => (path === '/api/v1/home' ? json(HOME) : json({ from: path }));
});
afterEach(() => vi.unstubAllGlobals());

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('Home’s one request', () => {
  it('fills the queries it stands in for, the guides only when they come', () => {
    const qc = client();
    seedFromHome(qc, HOME);
    expect(qc.getQueryData(SITE_KEY)).toEqual(HOME.site);
    expect(qc.getQueryData(PAPER_CHOICES_KEY)).toEqual(HOME.choices);
    expect(qc.getQueryData(GUIDES_KEY)).toBeUndefined();

    const guides = { startHere: { title: 'Start here' } } as unknown as HomeOut['guides'];
    seedFromHome(qc, { ...HOME, guides });
    expect(qc.getQueryData(GUIDES_KEY)).toEqual(guides);
  });

  it('asks for the year shown and a guest’s papers, and fills the others when it answers', async () => {
    const qc = client();
    const home = await qc.fetchQuery(homeQuery({ year: 2, picks: 'econometrics' }));
    expect(home.shelf.newFiles).toBe(3);
    expect(net.requests).toEqual(['/api/v1/home?year=2&picks=econometrics']);
    expect(qc.getQueryData(SITE_KEY)).toEqual(HOME.site);

    await qc.fetchQuery(homeQuery({ year: 1, picks: '' }));
    expect(net.requests[1]).toBe('/api/v1/home?year=1'); // no picks: none sent
  });

  it('reads the year and papers this browser keeps, a detour this visit first', () => {
    expect(storedHomeParams()).toEqual({ year: 1, picks: '' });
    local.set('selectedYear', '2');
    local.set('hub.papers', JSON.stringify({ papers: ['information-systems', 'Not an id'], zone: 'A' }));
    expect(storedHomeParams()).toEqual({ year: 2, picks: 'information-systems' });
    session.set('hub.browseYear', '3');
    expect(storedHomeParams().year).toBe(3);
  });

  it('before the first render, the site settings and the choices wait for it instead of asking themselves', async () => {
    local.set('selectedYear', '2');
    const qc = client();
    prefetchHome(qc);
    // what the shell and Home's blocks do when they mount: their own queries, under the same keys
    const [site, choices] = await Promise.all([
      qc.fetchQuery({ queryKey: SITE_KEY, queryFn: () => Promise.reject(new Error('asked /site')) }),
      qc.fetchQuery({ queryKey: PAPER_CHOICES_KEY, queryFn: () => Promise.reject(new Error('asked /choices')) }),
    ]);
    expect(site).toEqual(HOME.site);
    expect(choices).toEqual(HOME.choices);
    expect(net.requests).toEqual(['/api/v1/home?year=2']);
    expect(qc.getQueryData(homeKey({ year: 2, picks: '' }))).toEqual(HOME);
  });

  it('leaves alone what is already there', async () => {
    const qc = client();
    qc.setQueryData(SITE_KEY, { tagline: 'Kept' });
    prefetchHome(qc);
    await qc.fetchQuery(homeQuery(storedHomeParams()));
    expect(net.requests).toEqual(['/api/v1/home?year=1']);
    expect(qc.getQueryData(SITE_KEY)).toEqual(HOME.site); // the answer is newer
  });

  it('when it fails, the others fail with it, and asking again reads their own endpoints', async () => {
    net.answer = (path) =>
      path === '/api/v1/home' ? json({ error: { code: 'internal', message: 'Something went wrong.' } }, 500) : json({});
    const qc = client();
    prefetchHome(qc);
    await vi.waitFor(() => expect(qc.getQueryState(SITE_KEY)?.status).toBe('error'));
    const site = await qc.fetchQuery({ queryKey: SITE_KEY, queryFn: () => ({ tagline: 'From /site' }) });
    expect(site).toEqual({ tagline: 'From /site' });
  });
});
