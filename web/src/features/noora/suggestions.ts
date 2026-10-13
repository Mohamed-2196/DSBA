// What Mini Noora offers to answer when her panel opens: three or four questions about the page the student is on,
// built from the route and the module catalogue that is already loaded. One entry per route; the first that
// matches wins. Every question is one her brain answers well (suggestions.test.ts asks each one).
// Pure: no React, no network.
import { matchPath } from 'react-router-dom';
import type { ModuleSummary } from '../../api/types';
import type { Feature } from '../../auth';

export interface PageContext {
  pathname: string;
  /** the year the student is browsing */
  year: number | null;
  /** the module catalogue */
  modules: readonly ModuleSummary[];
  isOn: (feature: Feature) => boolean;
}

type Params = Record<string, string | undefined>;
interface Entry {
  path: string;
  chips: (ctx: PageContext, params: Params) => (string | false | null | undefined)[];
}

const MAX = 4;

/** A module's short name in a question: its unit code ('ST2133'), or its name when it has none. */
const called = (m: ModuleSummary): string => m.unitCode ?? m.name;

/** The modules of the student's year (every module when no year is chosen), in catalogue order. */
const ofYear = (ctx: PageContext): ModuleSummary[] => ctx.modules.filter((m) => ctx.year == null || m.year === ctx.year);

const nextExam = (ctx: PageContext) => ctx.isOn('calendar') && 'When is my next exam?';
const whatsIn = (m: ModuleSummary | undefined) => m && `What’s in ${called(m)}?`;
const papersFor = (ctx: PageContext, m: ModuleSummary | undefined) => ctx.isOn('library') && m && `Where are the ${called(m)} past papers?`;
const examOf = (ctx: PageContext, m: ModuleSummary | undefined) => ctx.isOn('calendar') && m && `When is the ${called(m)} exam?`;

/** For the pages of one module (and its lessons). */
function aboutModule(ctx: PageContext, params: Params): (string | false | undefined)[] {
  const m = ctx.modules.find((x) => x.id === params.moduleId);
  if (!m) return [];
  return [whatsIn(m), papersFor(ctx, m), examOf(ctx, m), 'Where is integration by parts?'];
}

const ENTRIES: Entry[] = [
  {
    path: '/',
    chips: (ctx) => {
      const [first] = ofYear(ctx);
      return [nextExam(ctx), whatsIn(first), papersFor(ctx, first), 'How do I find the MGF?'];
    },
  },
  {
    path: '/modules',
    chips: (ctx) => {
      const [a, b] = ofYear(ctx);
      return [whatsIn(a), whatsIn(b), 'Where is hypothesis testing?', nextExam(ctx)];
    },
  },
  { path: '/modules/:moduleId', chips: aboutModule },
  {
    path: '/library/*',
    chips: (ctx) => {
      const [a, b] = ofYear(ctx);
      return [papersFor(ctx, a), papersFor(ctx, b), 'Where is hypothesis testing?', nextExam(ctx)];
    },
  },
  {
    path: '/calendar',
    chips: (ctx) => {
      const [first] = ofYear(ctx);
      return [nextExam(ctx), ctx.isOn('calendar') && 'When is my next mock?', examOf(ctx, first), papersFor(ctx, first)];
    },
  },
  {
    path: '/forum/*',
    chips: (ctx) => ['What is a reduction formula?', 'Where is integration by parts?', 'How do I find the MGF?', nextExam(ctx)],
  },
  {
    path: '/notes/*',
    chips: (ctx) => {
      const [first] = ofYear(ctx);
      return [whatsIn(first), 'Where is integration by parts?', 'How do I find the MGF?', papersFor(ctx, first)];
    },
  },
  {
    path: '/grades',
    chips: (ctx) => {
      const [a, b] = ofYear(ctx);
      return [nextExam(ctx), examOf(ctx, a), examOf(ctx, b), whatsIn(a)];
    },
  },
];

/** Anywhere else. */
const FALLBACK = (ctx: PageContext): (string | false | undefined)[] => {
  const [first] = ofYear(ctx);
  return [nextExam(ctx), whatsIn(first), 'Where is hypothesis testing?', 'How do I find the MGF?'];
};

/** Three or four questions for the page at `ctx.pathname`. */
export function pageSuggestions(ctx: PageContext): string[] {
  let raw: (string | false | null | undefined)[] | null = null;
  for (const entry of ENTRIES) {
    const match = matchPath({ path: entry.path, end: true }, ctx.pathname);
    if (match) {
      raw = entry.chips(ctx, match.params);
      break;
    }
  }
  let chips = unique(raw ?? []);
  if (chips.length < 3) chips = unique([...chips, ...FALLBACK(ctx)]);
  return chips.slice(0, MAX);
}

function unique(list: (string | false | null | undefined)[]): string[] {
  return [...new Set(list.filter((s): s is string => typeof s === 'string' && s.length > 0))];
}
