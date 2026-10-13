// Query → grouped results for the palette. Content (modules, library items, threads, newsletter issues and
// calendar dates) comes ranked from the API; the palette adds its own actions, pages and recent searches.
import type { ModuleSummary, SearchHit, SearchResults } from '../../api/types';
import type { Feature } from '../../auth';
import { MYCLASS_URL, REPORT_PROBLEM_URL, UOL_PORTAL_URL } from '../../data/people';
import { daysBetween, formatLong, isDayKey, parseDay, today } from '../../lib/dates';
import { safeInternalPath } from '../../ui';
import { EVENT_TYPES, TYPE_ORDER, type EventType } from '../calendar/public';
import { scoreEntry, tokenize } from './match';

export type GroupId = 'recent' | 'suggested' | 'modules' | 'files' | 'threads' | 'issues' | 'events' | 'actions' | 'pages' | 'quick' | 'goto' | 'fallback';

export type IconName =
  | 'ArrowsLeftRight'
  | 'Bank'
  | 'Books'
  | 'Calculator'
  | 'CalendarDots'
  | 'ChatsCircle'
  | 'Eye'
  | 'EyeSlash'
  | 'GithubLogo'
  | 'GraduationCap'
  | 'House'
  | 'Info'
  | 'Moon'
  | 'Newspaper'
  | 'PencilSimpleLine'
  | 'SquaresFour'
  | 'Sun'
  | 'UploadSimple';

export type Run = { type: 'theme' } | { type: 'year'; year: 1 | 2 | 3 } | { type: 'noora'; hide: boolean };

interface Base {
  id: string;
  group: GroupId;
  title: string;
  subtitle?: string | null;
}

export type Item =
  | (Base & { kind: 'module'; moduleId: string; year: number | null; code: string | null; to: string })
  | (Base & { kind: 'file'; to: string; meta: string | null })
  | (Base & { kind: 'thread'; to: string; meta: string | null })
  | (Base & { kind: 'issue'; to: string; number: number | null })
  | (Base & { kind: 'event'; to: string; when: Date | null; eventType: EventType | null; rel: string | null; past: boolean })
  | (Base & { kind: 'action'; icon: IconName; keywords: string[]; to?: string; href?: string; run?: Run; feature?: Feature })
  | (Base & { kind: 'page'; icon: IconName; keywords: string[]; to: string; feature?: Feature })
  | (Base & { kind: 'recent' | 'suggestion'; query: string })
  | (Base & { kind: 'more'; target: GroupId })
  | (Base & { kind: 'fallback'; icon: IconName; to: string; feature: Feature });

export type ItemKind = Item['kind'];

export interface Group {
  id: GroupId;
  label: string;
  items: Item[];
  /** How many results the group has (shown beside its label). */
  total: number;
}

export interface Results {
  groups: Group[];
  count: number;
  /** A query that found nothing (the fallback group is shown). */
  empty: boolean;
}

export const GROUPS: Record<GroupId, { label: string; cap?: number; noun?: string }> = {
  recent: { label: 'Recent searches' },
  suggested: { label: 'Try searching for' },
  modules: { label: 'Modules', cap: 4, noun: 'modules' },
  files: { label: 'Library', cap: 3, noun: 'files' },
  threads: { label: 'Forum', cap: 3, noun: 'threads' },
  issues: { label: 'The DSBA Newsletter', cap: 2, noun: 'issues' },
  events: { label: 'Calendar', cap: 3, noun: 'dates' },
  actions: { label: 'Actions', cap: 3, noun: 'actions' },
  pages: { label: 'Pages', cap: 3, noun: 'pages' },
  quick: { label: 'Quick actions' },
  goto: { label: 'Go to' },
  fallback: { label: 'Search somewhere else' },
};

const CONTENT_ORDER: readonly GroupId[] = ['modules', 'files', 'threads', 'issues', 'events'];

export const SUGGESTIONS = ['Econometrics', 'Past papers', 'Regression', 'ST2133'];

/** Pages (also the "Go to" list on an empty query); those of a switched-off feature are left out. */
export const PAGE_ENTRIES: Item[] = (
  [
    { path: '/', title: 'Home', icon: 'House', keywords: ['dashboard', 'start'] },
    { path: '/modules', title: 'Modules', icon: 'SquaresFour', keywords: ['subjects', 'courses', 'lessons', 'videos', 'chapters'] },
    { path: '/library', feature: 'library', title: 'Library', icon: 'Books', keywords: ['files', 'notes', 'past papers', 'exams', 'study guide', 'documents'] },
    { path: '/newsletter', feature: 'newsletter', title: 'The DSBA newsletter', icon: 'Newspaper', keywords: ['newsletter', 'issues', 'news'] },
    { path: '/forum', feature: 'forum', title: 'Forum', icon: 'ChatsCircle', keywords: ['threads', 'questions', 'discussion', 'ask'] },
    {
      path: '/career',
      feature: 'career',
      title: 'Career Navigator',
      icon: 'GraduationCap',
      keywords: ['careers', 'jobs', 'roles', 'skills', 'internships', 'graduate', 'opportunities', 'certificates', 'cfa', 'frm', 'cv'],
    },
    { path: '/calendar', feature: 'calendar', title: 'Calendar', icon: 'CalendarDots', keywords: ['exams', 'timetable', 'dates', 'deadlines', 'ics', 'subscribe'] },
    { path: '/grades', feature: 'grades', title: 'Grade calculator', icon: 'Calculator', keywords: ['grades', 'gpa', 'classification', 'marks', 'degree'] },
    { path: '/about', title: 'About DSBA Hub', icon: 'Info', keywords: ['contributors', 'disclaimer', 'credits'] },
  ] as const
).map(
  (p): Item => ({
    id: `page:${p.path}`,
    group: 'pages',
    kind: 'page',
    title: p.title,
    icon: p.icon,
    keywords: [...p.keywords],
    to: p.path,
    ...('feature' in p ? { feature: p.feature } : {}),
  }),
);

/** Actions depend on the current year, the theme and whether Mini Noora is hidden. */
export function buildActions({ year, theme, nooraHidden = false }: { year: number | null; theme: 'light' | 'dark'; nooraHidden?: boolean }): Item[] {
  const switches = ([1, 2, 3] as const)
    .filter((y) => y !== year)
    .map(
      (y): Item => ({
        id: `action:year-${y}`,
        group: 'actions',
        kind: 'action',
        title: `Switch to Year ${y}`,
        icon: 'ArrowsLeftRight',
        keywords: ['change year', 'cohort', `y${y}`],
        run: { type: 'year', year: y },
      }),
    );
  return [
    { id: 'action:new-thread', group: 'actions', kind: 'action', title: 'Start a thread', icon: 'PencilSimpleLine', keywords: ['new thread', 'ask a question', 'post', 'forum'], to: '/forum/new', feature: 'forum' },
    // Contributing means uploading to the library (decision D6).
    {
      id: 'action:upload',
      group: 'actions',
      kind: 'action',
      title: 'Upload a file',
      icon: 'UploadSimple',
      keywords: ['upload', 'share notes', 'share a file', 'past paper', 'contribute', 'add a file'],
      to: '/library?upload=1',
      feature: 'library.uploads',
    },
    ...switches,
    {
      id: 'action:theme',
      group: 'actions',
      kind: 'action',
      title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      icon: theme === 'dark' ? 'Sun' : 'Moon',
      keywords: ['theme', 'dark mode', 'light mode', 'toggle theme', 'appearance', 'night'],
      run: { type: 'theme' },
    },
    { id: 'action:grades', group: 'actions', kind: 'action', title: 'Calculate my grade', icon: 'Calculator', keywords: ['gpa', 'classification', 'grade calculator', 'marks'], to: '/grades', feature: 'grades' },
    { id: 'action:subscribe', group: 'actions', kind: 'action', title: 'Subscribe to the calendar', icon: 'CalendarDots', keywords: ['ics', 'google calendar', 'outlook', 'feed', 'subscribe'], to: '/calendar', feature: 'calendar' },
    nooraHidden
      ? { id: 'action:noora', group: 'actions', kind: 'action', title: 'Show Mini Noora', icon: 'Eye', keywords: ['noora', 'mini noora', 'study helper', 'assistant', 'mascot', 'bring back'], run: { type: 'noora', hide: false }, feature: 'noora' }
      : { id: 'action:noora', group: 'actions', kind: 'action', title: 'Hide Mini Noora', icon: 'EyeSlash', keywords: ['noora', 'mini noora', 'study helper', 'assistant', 'mascot'], run: { type: 'noora', hide: true }, feature: 'noora' },
    { id: 'action:report', group: 'actions', kind: 'action', title: 'Report a problem', icon: 'GithubLogo', keywords: ['bug', 'problem', 'broken', 'feedback', 'github', 'issue'], href: REPORT_PROBLEM_URL },
    { id: 'action:myclass', group: 'actions', kind: 'action', title: 'Open BIBF MyClass', icon: 'GraduationCap', keywords: ['myclass', 'bibf'], href: MYCLASS_URL },
    { id: 'action:uol', group: 'actions', kind: 'action', title: 'Open the UoL student portal', icon: 'Bank', keywords: ['uol', 'university of london', 'portal'], href: UOL_PORTAL_URL },
  ];
}

// ── API hits → palette items ───────────────────────────────────────────────────────────────────


/** Local midnight of the hit's calendar day ('2026-10-23T00:00:00+03:00' → 23 Oct). */
function hitDay(iso: string | null): Date | null {
  const key = iso?.slice(0, 10);
  return key && isDayKey(key) ? parseDay(key) : null;
}

/** 'in 28 days', 'tomorrow', 'today', '3 days ago', '5 months ago', counted from today in Bahrain. */
export function relativeDay(date: Date, now: Date = new Date()): string {
  const d = daysBetween(today(now), date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 60) return `in ${d} days`;
  if (d >= 60) return `in ${Math.round(d / 30)} months`;
  if (d > -60) return `${-d} days ago`;
  if (d > -365) return `${Math.round(-d / 30)} months ago`;
  const years = Math.round(-d / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/** 'Exam · Year 2' → 'exam'. */
const eventTypeOf = (meta: string | null): EventType | null => {
  const head = (meta ?? '').split(' · ')[0]?.trim().toLowerCase() ?? '';
  return TYPE_ORDER.find((t) => EVENT_TYPES[t].label.toLowerCase() === head) ?? null;
};

/** The API's meta ('ST2133 · 3 replies') in the Hub's own style: parts joined with commas, never middle dots. */
const plainMeta = (meta: string | null): string | null => (meta ? meta.split(/\s+·\s+/).join(', ') : null);

function toItem(hit: SearchHit, group: GroupId, getModule: (id: string) => ModuleSummary | null, now: Date): Item | null {
  // Only a page of the Hub ('/forum/x', never '//host' or '/\\host') is navigated to (security review, finding 12).
  const to = safeInternalPath(hit.url);
  if (!to) return null;
  const base = { id: `${hit.type}:${hit.id}`, group, title: hit.title };
  switch (hit.type) {
    case 'module': {
      const m = getModule(hit.id);
      return { ...base, kind: 'module', moduleId: hit.id, year: m?.year ?? null, code: m?.unitCode ?? null, subtitle: m ? `Year ${m.year} module${m.lessonCount ? `, ${m.lessonCount} lessons` : ''}` : plainMeta(hit.meta), to };
    }
    case 'library':
      return { ...base, kind: 'file', subtitle: [plainMeta(hit.meta), hit.snippet].filter(Boolean).join(': ') || null, meta: null, to };
    case 'thread':
      return { ...base, kind: 'thread', subtitle: hit.snippet, meta: plainMeta(hit.meta), to };
    case 'issue': {
      const n = /Issue (\d+)/.exec(hit.meta ?? '');
      return { ...base, kind: 'issue', subtitle: hit.snippet ?? plainMeta(hit.meta), number: n ? Number(n[1]) : null, to };
    }
    case 'event': {
      const when = hitDay(hit.date);
      const past = when ? daysBetween(today(now), when) < 0 : false;
      const date = when ? formatLong(when) : null;
      const subtitle = [plainMeta(hit.meta), date].filter(Boolean).join(', ') + (hit.snippet ? `. ${hit.snippet}` : '');
      return { ...base, kind: 'event', subtitle, when, eventType: eventTypeOf(hit.meta), rel: when ? relativeDay(when, now) : null, past, to };
    }
  }
}

// ── Running a query ────────────────────────────────────────────────────────────────────────────

/** "year 3", "y3", "Year 2 stats": a cohort to browse rather than words to match. */
export const YEAR_RE = /\b(?:year\s*|y)([123])\b/i;

export interface SearchInput {
  query: string;
  year: number | null;
  theme: 'light' | 'dark';
  nooraHidden?: boolean;
  expanded: ReadonlySet<GroupId>;
  recent: readonly string[];
  /** The API's answer for the query (undefined while there is none yet). */
  results: SearchResults | undefined;
  getModule: (id: string) => ModuleSummary | null;
  getModulesForYear: (year: number) => ModuleSummary[];
  /** Whether a feature is on for the person. */
  isOn: (f: Feature) => boolean;
  now?: Date;
}

function finish(groups: Omit<Group, 'label'>[], count: number, empty = false): Results {
  return { groups: groups.map((g) => ({ ...g, label: GROUPS[g.id].label })), count, empty };
}

const moduleItem = (m: ModuleSummary): Item => ({
  id: `module:${m.id}`,
  group: 'modules',
  kind: 'module',
  moduleId: m.id,
  year: m.year,
  code: m.unitCode,
  title: m.name,
  subtitle: `Year ${m.year} module${m.lessonCount ? `, ${m.lessonCount} lessons` : ''}`,
  to: `/modules/${m.id}`,
});

/** The words of the query without a cohort ("year 2"), as the API gets them. */
export function textOf(query: string): string {
  return query.replace(YEAR_RE, ' ').replace(/\s+/g, ' ').trim();
}

export function runSearch({ query, year, theme, nooraHidden = false, expanded, recent, results, getModule, getModulesForYear, isOn, now = new Date() }: SearchInput): Results {
  const cohortMatch = YEAR_RE.exec(query);
  const cohort = cohortMatch ? Number(cohortMatch[1]) : null;
  const text = textOf(query);
  const tokens = tokenize(text);
  // The API leaves out switched-off features' hits too; this keeps a cached answer from showing them after a switch flips.
  const shown = (i: Item) => !(i.kind === 'action' || i.kind === 'page' || i.kind === 'fallback') || !i.feature || isOn(i.feature);
  const actions = buildActions({ year, theme, nooraHidden }).filter(shown);
  const pages = PAGE_ENTRIES.filter(shown);
  const off = (feature: Feature) => !isOn(feature);

  // Just a cohort: switch to it, or browse its modules.
  if (cohort && !tokens.length) {
    const groups: Omit<Group, 'label'>[] = [];
    const sw = actions.find((a) => a.id === `action:year-${cohort}`);
    if (sw) groups.push({ id: 'actions', items: [sw], total: 1 });
    const mods = getModulesForYear(cohort).map(moduleItem);
    groups.push({ id: 'modules', items: mods, total: mods.length });
    return finish(groups, groups.reduce((n, g) => n + g.total, 0));
  }

  // Nothing typed: recent searches (or suggestions), quick actions and pages.
  if (!tokens.length) {
    const groups: Omit<Group, 'label'>[] = [];
    if (recent.length) groups.push({ id: 'recent', items: recent.map((q) => ({ id: `recent:${q}`, kind: 'recent', group: 'recent', title: q, query: q })), total: 0 });
    else groups.push({ id: 'suggested', items: SUGGESTIONS.map((q) => ({ id: `suggest:${q}`, kind: 'suggestion', group: 'suggested', title: q, query: q })), total: 0 });
    groups.push({
      id: 'quick',
      items: actions.filter((a) => a.id === 'action:new-thread' || a.id === 'action:upload' || a.id === 'action:theme' || a.id.startsWith('action:year-')).map((a) => ({ ...a, group: 'quick' })),
      total: 0,
    });
    groups.push({ id: 'goto', items: pages.filter((p) => p.id !== 'page:/about').map((p) => ({ ...p, group: 'goto' })), total: 0 });
    return finish(groups, 0);
  }

  const lookup = (id: string) => getModule(id);
  const content: Record<GroupId, Item[]> = {
    recent: [],
    suggested: [],
    quick: [],
    goto: [],
    fallback: [],
    actions: [],
    pages: [],
    modules: (results?.modules ?? []).map((h) => toItem(h, 'modules', lookup, now)).filter((i): i is Item => !!i),
    files: off('library') ? [] : (results?.library ?? []).map((h) => toItem(h, 'files', lookup, now)).filter((i): i is Item => !!i),
    threads: off('forum') ? [] : (results?.threads ?? []).map((h) => toItem(h, 'threads', lookup, now)).filter((i): i is Item => !!i),
    issues: off('newsletter') ? [] : (results?.issues ?? []).map((h) => toItem(h, 'issues', lookup, now)).filter((i): i is Item => !!i),
    events: off('calendar') ? [] : (results?.events ?? []).map((h) => toItem(h, 'events', lookup, now)).filter((i): i is Item => !!i),
  };
  // A cohort in the query narrows the modules to that year.
  if (cohort) content.modules = content.modules.filter((i) => i.kind !== 'module' || i.year === cohort);

  // The palette's own entries, scored locally.
  const scored = (list: Item[]) =>
    list
      .map((e, i) => ({ e, i, s: e.kind === 'action' || e.kind === 'page' ? scoreEntry({ title: e.title, keywords: e.keywords }, tokens, text) : 0 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i);
  const actionHits = scored(actions);
  const pageHits = scored(pages);
  content.actions = actionHits.map((x) => x.e);
  content.pages = pageHits.map((x) => x.e);
  const localBest = Math.max(0, actionHits[0]?.s ?? 0, pageHits[0]?.s ?? 0);

  // Content first, in the usual order. Actions and pages lead only when they match outright ("dark",
  // "grades") and come last otherwise.
  const order: GroupId[] = [...CONTENT_ORDER];
  const local: GroupId[] = (['actions', 'pages'] as const).filter((id) => content[id].length);
  if (localBest >= 100) order.unshift(...local);
  else order.push(...local);

  let count = 0;
  const groups: Omit<Group, 'label'>[] = [];
  for (const id of order) {
    const list = content[id];
    if (!list.length) continue;
    count += list.length;
    const cap = expanded.has(id) ? Infinity : (GROUPS[id].cap ?? Infinity);
    let items = list.slice(0, cap);
    const hidden = list.length - items.length;
    if (hidden > 0) items = [...items, { id: `more:${id}`, kind: 'more', group: id, title: `Show ${hidden} more ${GROUPS[id].noun ?? 'results'}`, target: id }];
    groups.push({ id, items, total: list.length });
  }

  if (!groups.length) {
    const q = query.trim();
    groups.push({
      id: 'fallback',
      items: (
        [
          { id: 'fallback:library', kind: 'fallback', group: 'fallback', icon: 'Books', title: `Search the library for “${q}”`, to: `/library?q=${encodeURIComponent(q)}`, feature: 'library' },
          { id: 'fallback:forum', kind: 'fallback', group: 'fallback', icon: 'ChatsCircle', title: `Search the forum for “${q}”`, to: `/forum?q=${encodeURIComponent(q)}`, feature: 'forum' },
          { id: 'fallback:ask', kind: 'fallback', group: 'fallback', icon: 'PencilSimpleLine', title: `Ask the forum about “${q}”`, to: `/forum/new?title=${encodeURIComponent(q)}`, feature: 'forum' },
        ] satisfies Item[]
      ).filter(shown),
      total: 0,
    });
    return finish(groups, 0, true);
  }
  return finish(groups, count);
}
