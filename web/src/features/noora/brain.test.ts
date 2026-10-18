// Mini Noora's answers about MGFs (student test ST-3) and exam dates, on a small made-up catalogue.
import { describe, expect, it, vi } from 'vitest';
import type { ModuleDetail, ModuleSummary, NooraDoc } from '../../api/types';
import type { Feature } from '../../auth';
import type { CalendarEvent } from '../calendar/public';

// The brain only needs two small helpers from other features; their component trees stay out of a Node test.
vi.mock('../calendar/public', () => ({
  eventDate: (e: { date: string }) => {
    const [y = 1970, m = 1, d = 1] = e.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
}));
vi.mock('../modules/public', () => ({
  lessonHref: (id: string, lesson: string) => `/modules/${id}/lessons/${lesson}`,
}));

const { answer, buildKnowledge } = await import('./brain');
const { DISTRIBUTIONS, LAPLACE_MGF_STEPS, MGF_DEFINITION } = await import('./formulas');
const { readSeed } = await import('../../testing/seed');
const SCRIPT = readSeed<NooraDoc>('noora').script;

const summary = (id: string, unitCode: string, name: string, year: number): ModuleSummary =>
  ({
    id,
    unitCode,
    name,
    shortName: name,
    year,
    description: `${name}.`,
    chapterCount: 1,
    lessonCount: 3,
  }) as ModuleSummary;

const ST2133 = summary('advanced-stats-distribution', 'ST2133', 'Advanced Statistics: Distribution Theory', 2);
const detail = {
  ...ST2133,
  chapters: [
    { title: 'Probability Space', videos: [{ id: 'ind', title: 'Indicator Functions' }] },
    {
      title: 'Random variables and univariate distributions',
      videos: [
        { id: 'bern', title: 'Introduction to the Bernoulli Distribution' },
        { id: 'pois', title: 'An Introduction to the Poisson Distribution' },
        { id: 'expo', title: 'Probability Exponential Distribution Problems' },
      ],
    },
  ],
} as unknown as ModuleDetail;

const knowledge = (events: CalendarEvent[] | null = [], isOn: (f: Feature) => boolean = () => true) =>
  buildKnowledge([ST2133], new Map([[ST2133.id, detail]]), events, 'Sara', isOn, SCRIPT);
const ask = (
  text: string,
  attachments: { kind: 'image' | 'file'; name: string }[] = [],
  events?: CalendarEvent[] | null,
  now?: number,
) => answer({ text, attachments, year: 2 }, knowledge(events), now);
const askWithout = (off: Feature, text: string) =>
  answer(
    { text, attachments: [], year: 2 },
    knowledge(null, (f) => f !== off),
  );
const links = (r: { refs: { to: string }[] }) => r.refs.map((x) => x.to);
const mgfOf = (id: string) => DISTRIBUTIONS.find((d) => d.id === id)?.mgf;

describe('MGF questions (ST-3)', () => {
  it('gives the MGF of the distribution asked about, with its lesson', () => {
    const r = ask('how do I find the mgf of a poisson');
    expect(r.formula).toBe(mgfOf('poisson'));
    expect(r.steps).toBeUndefined();
    expect(r.text).toBe('The MGF of the Poisson distribution:');
    expect(r.refs.map((x) => x.label)).toEqual([
      'Chapter 2 · Random variables and univariate distributions',
      'Poisson distribution',
      'ST2133 notes and past papers',
    ]);
    expect(r.refs[1]?.to).toBe('/modules/advanced-stats-distribution/lessons/pois');
  });

  it('knows the normal, the exponential and the gamma, and reads "beta" in a gamma question as a parameter', () => {
    expect(ask('mgf of the normal distribution').formula).toBe(mgfOf('normal'));
    expect(ask('moment generating function exponential').formula).toBe(mgfOf('exponential'));
    expect(ask('mgf of a gamma with shape alpha and rate beta').formula).toBe(mgfOf('gamma'));
    expect(ask('mgf of the negative binomial').formula).toBe(MGF_DEFINITION);
  });

  it('shows the worked Laplace example only for the Laplace distribution', () => {
    expect(ask('mgf of the laplace distribution').steps).toBe(LAPLACE_MGF_STEPS);
    expect(ask('How do I find the MGF?').steps).toBeUndefined();
  });

  it('starts from the definition when no distribution is named, and offers some', () => {
    const r = ask('How do I find the MGF?');
    expect(r.formula).toBe(MGF_DEFINITION);
    expect(r.suggestions).toEqual(['MGF of a Poisson', 'MGF of the normal', 'MGF of the exponential']);
  });

  it('says it can’t read a photo, and never passes one off as the Laplace question', () => {
    const r = ask('How do I find the MGF?', [{ kind: 'image', name: 'IMG_2041.jpg' }]);
    expect(r.text.startsWith('I can’t read photos in this preview yet.')).toBe(true);
    expect(r.steps).toBeUndefined();
    const bare = ask('', [{ kind: 'image', name: 'IMG_2041.jpg' }]);
    expect(bare.text.startsWith('I can’t read photos in this preview yet.')).toBe(true);
    expect(bare.formula).toBeUndefined();
    expect(bare.steps).toBeUndefined();
    // a photo named after the question goes by its name
    expect(ask('', [{ kind: 'image', name: 'laplace-mgf.png' }]).steps).toBe(LAPLACE_MGF_STEPS);
  });
});

describe('exam dates', () => {
  const exam = (date: string): CalendarEvent =>
    ({
      id: `${date}-st2133`,
      date,
      endDate: null,
      title: 'ST2133 exam',
      type: 'exam',
      year: 2,
      moduleId: ST2133.id,
      unitCode: 'ST2133',
      time: null,
      place: null,
      sample: false,
    }) as CalendarEvent;

  it('counts from today in Bahrain', () => {
    // 21:30 UTC on 11 October is 00:30 on 12 October in Manama: the exam is today there
    const now = Date.UTC(2026, 9, 11, 21, 30);
    expect(ask('when is my next exam', [], [exam('2026-10-12')], now).text).toBe(
      'Your next exam is ST2133 Advanced Statistics: Distribution Theory today, Monday 12 October.',
    );
    expect(ask('when is my next exam', [], [exam('2026-10-23')], now).text).toBe(
      'Your next exam is ST2133 Advanced Statistics: Distribution Theory on Friday 23 October, in 11 days.',
    );
  });

  it('says so when the calendar is out of reach', () => {
    expect(ask('when is my next exam', [], null).text).toMatch(/^I can’t reach the calendar right now/);
  });
});

describe('switched-off features', () => {
  it('leaves the calendar out of exam answers while it is off', () => {
    const r = askWithout('calendar', 'when is my next exam');
    expect(r.text).toBe('The Hub’s calendar is switched off right now, so I can’t check the exam dates for Year 2.');
    expect(links(r).some((to) => to.startsWith('/calendar'))).toBe(false);
  });

  it('leaves the library and the Files tab out while the library is off', () => {
    const files = askWithout('library', 'past papers for ST2133');
    expect(links(files).some((to) => to.startsWith('/library') || to.includes('tab=files'))).toBe(false);
    expect(files.text).toMatch(/library is switched off/);
    const anywhere = askWithout('library', 'past papers');
    expect(links(anywhere)).toEqual([]);
    const mgf = askWithout('library', 'how do I find the mgf of the poisson distribution');
    expect(links(mgf).some((to) => to.startsWith('/library'))).toBe(false);
  });

  it('points at the library while it is on', () => {
    expect(links(ask('past papers'))).toEqual(['/library']);
  });
});
