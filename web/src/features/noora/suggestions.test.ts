// The questions Mini Noora offers for each page, and that her brain answers every one of them.
import { describe, expect, it, vi } from 'vitest';
import type { ModuleDetail, ModuleSummary } from '../../api/types';
import type { Feature } from '../../auth';

vi.mock('../calendar/public', () => ({
  eventDate: (e: { date: string }) => {
    const [y = 1970, m = 1, d = 1] = e.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
}));
vi.mock('../modules/public', () => ({
  lessonHref: (id: string, c: number, v: number) => `/modules/${id}?tab=lessons&chapter=${c}&video=${v}`,
}));

const { answer, buildKnowledge } = await import('./brain');
const { pageSuggestions } = await import('./suggestions');

const summary = (id: string, unitCode: string, name: string, year: number): ModuleSummary =>
  ({ id, unitCode, name, shortName: name, year, description: `${name}.`, chapterCount: 1, lessonCount: 2 }) as ModuleSummary;

const MATHS = summary('mathematics', 'MT1174', 'Mathematical Methods', 1);
const STATS = summary('statistics-1', 'ST1215', 'Introduction to Statistics', 1);
const DIST = summary('advanced-stats-distribution', 'ST2133', 'Advanced Statistics: Distribution Theory', 2);
const INFER = summary('statistical-inference', 'ST2134', 'Statistical Inference', 2);
const catalogue = [MATHS, STATS, DIST, INFER];

const details = new Map<string, ModuleDetail>(
  [
    [MATHS, [{ title: 'Integration', videos: [{ title: 'Integration by parts' }, { title: 'The DI method' }] }]],
    [STATS, [{ title: 'Hypothesis testing', videos: [{ title: 'Testing a mean' }] }]],
    [DIST, [{ title: 'Random variables and univariate distributions', videos: [{ title: 'An Introduction to the Poisson Distribution' }] }]],
    [INFER, [{ title: 'Estimation', videos: [{ title: 'Point estimation' }] }]],
  ].map(([m, chapters]) => [(m as ModuleSummary).id, { ...(m as ModuleSummary), chapters } as unknown as ModuleDetail]),
);

const events = [
  { id: 'e1', type: 'exam', date: '2099-05-04', moduleId: INFER.id, year: 2, sample: false, title: 'ST2134 exam' },
  { id: 'e2', type: 'mock', date: '2099-04-04', moduleId: DIST.id, year: 2, sample: false, title: 'ST2133 mock' },
  { id: 'e3', type: 'exam', date: '2099-05-08', moduleId: DIST.id, year: 2, sample: false, title: 'ST2133 exam' },
] as unknown as Parameters<typeof buildKnowledge>[2];

const allOn = () => true;
const ctx = (pathname: string, isOn: (f: Feature) => boolean = allOn) => ({ pathname, year: 2, modules: catalogue, isOn });

const PAGES = ['/', '/modules', `/modules/${DIST.id}`, '/library', '/library/abc', '/calendar', '/forum', '/forum/some-thread', '/forum/new', '/grades', '/notes', '/notes/a-note', '/career', '/newsletter/issue-1', '/about'];

describe('pageSuggestions', () => {
  it('offers three or four different questions on every page', () => {
    for (const page of PAGES) {
      const chips = pageSuggestions(ctx(page));
      expect(chips.length, page).toBeGreaterThanOrEqual(3);
      expect(chips.length, page).toBeLessThanOrEqual(4);
      expect(new Set(chips).size, page).toBe(chips.length);
    }
  });

  it('asks about the module that is open', () => {
    expect(pageSuggestions(ctx(`/modules/${DIST.id}`))).toEqual(['What’s in ST2133?', 'Where are the ST2133 past papers?', 'When is the ST2133 exam?', 'Where is integration by parts?']);
  });

  it('uses the student’s own year', () => {
    expect(pageSuggestions(ctx('/modules'))).toContain('What’s in ST2134?');
    expect(pageSuggestions({ ...ctx('/modules'), year: 1 })).toContain('What’s in MT1174?');
  });

  it('leaves out the calendar and the library while they are switched off', () => {
    const off = (f: Feature) => f !== 'calendar' && f !== 'library';
    for (const page of PAGES) {
      const chips = pageSuggestions(ctx(page, off));
      expect(chips.join(' '), page).not.toMatch(/exam|mock|past papers/);
      expect(chips.length, page).toBeGreaterThanOrEqual(3);
    }
  });

  it('only offers questions her brain can answer', () => {
    const knowledge = buildKnowledge(catalogue, details, events, 'Sara', allOn);
    const now = new Date(2099, 0, 1).getTime();
    for (const page of PAGES) {
      for (const chip of pageSuggestions(ctx(page))) {
        const reply = answer({ text: chip, attachments: [], year: 2 }, knowledge, now);
        expect(reply.mood, `${page}: ${chip} → ${reply.text}`).not.toBe('sad');
        expect(reply.refs.length, `${page}: ${chip}`).toBeGreaterThan(0);
      }
    }
  });
});
