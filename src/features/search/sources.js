// What the palette searches. Static entries come from shared data (modules, chapters, calendar,
// pages). Files, threads and newsletter issues come from the other features' public.js, loaded
// lazily: the palette is mounted by the shell on every page, so a broken import elsewhere must
// never take the app down with it.
import { MODULES, getModule, getModuleStats } from '../../data/modules.js';
import { EVENTS, EVENT_TYPES, eventDate } from '../../data/calendar.js';

const COHORT = { 1: 'Year 1', 2: 'Year 2', 3: 'Year 3' };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Static entries ─────────────────────────────────────────────────────
// What students actually type.
const ALIASES = [
  [/statistic/i, 'stats'],
  [/mathemat|maths/i, 'maths math'],
  [/econometric/i, 'metrics'],
  [/machine learning/i, 'ml ai'],
  [/programming/i, 'coding python sql'],
  [/information systems/i, 'is'],
  [/analytics/i, 'ba'],
];
const aliasesFor = (name) => ALIASES.filter(([re]) => re.test(name)).map(([, a]) => a);

/** Words for a module's resources, so "ST2133 past papers" finds the module. */
function resourceWords(m) {
  const r = m.resources;
  const out = [];
  if (r.vle || r.olderExams) out.push('past papers', 'past exams', 'previous exams');
  if (r.materials) out.push('books', 'study guide');
  if (m.notes.length) out.push('notes');
  if (r.cheatSheet) out.push('cheat sheet');
  if (m.chapters.length) out.push('videos', 'lectures');
  return out;
}

export const MODULE_ENTRIES = MODULES.map((m) => {
  const s = getModuleStats(m);
  return {
    id: `module:${m.id}`,
    group: 'modules',
    kind: 'module',
    moduleId: m.id,
    year: m.year,
    code: m.unitCode || null,
    title: m.name,
    subtitle: `${COHORT[m.year]} module${s.videos ? `, ${plural(s.videos, 'lesson')}` : ''}${s.notes ? `, ${plural(s.notes, 'set')} of notes` : ''}`,
    aliases: [m.shortName, m.v1Name, ...aliasesFor(m.name).flatMap((x) => x.split(' '))],
    keywords: [...resourceWords(m), m.description],
    to: `/modules/${m.id}`,
  };
});

export const LESSON_ENTRIES = MODULES.flatMap((m) =>
  m.chapters.map((c, i) => ({
    id: `lesson:${m.id}:${i}`,
    group: 'lessons',
    kind: 'lesson',
    moduleId: m.id,
    year: m.year,
    title: c.title,
    subtitle: `${m.unitCode ? `${m.unitCode} ` : ''}${m.shortName}, chapter ${i + 1} of ${m.chapters.length}${c.videos.length > 1 ? `, ${plural(c.videos.length, 'video')}` : ''}`,
    keywords: [m.name, m.shortName, m.unitCode, ...aliasesFor(m.name), c.v1Title],
    meta: m.unitCode || null,
    to: `/modules/${m.id}?tab=lessons&chapter=${i}&video=0`,
  })),
);

export const EVENT_ENTRIES = EVENTS.map((e) => {
  const m = getModule(e.moduleId);
  return {
    id: `event:${e.id}`,
    group: 'events',
    kind: 'event',
    event: e,
    moduleId: e.moduleId,
    year: e.year,
    title: e.title,
    keywords: [m?.name, m?.shortName, e.unitCode, EVENT_TYPES[e.type]?.label, e.v1Title],
    to: `/calendar?event=${encodeURIComponent(e.id)}`,
  };
});

/** Pages (always available, also the "Go to" list on an empty query). */
export const PAGE_ENTRIES = [
  { path: '/', title: 'Home', icon: 'House', keywords: ['dashboard', 'start'] },
  { path: '/modules', title: 'Modules', icon: 'SquaresFour', keywords: ['subjects', 'courses', 'lessons', 'videos'] },
  { path: '/library', title: 'Library', icon: 'Books', keywords: ['files', 'notes', 'past papers', 'exams', 'study guide', 'documents'] },
  { path: '/newsletter', title: 'The DSBA newsletter', icon: 'Newspaper', keywords: ['newsletter', 'issues', 'news'] },
  { path: '/forum', title: 'Forum', icon: 'ChatsCircle', keywords: ['threads', 'questions', 'discussion', 'ask'] },
  { path: '/calendar', title: 'Calendar', icon: 'CalendarDots', keywords: ['exams', 'timetable', 'dates', 'deadlines', 'ics'] },
  { path: '/grades', title: 'Grade calculator', icon: 'Calculator', keywords: ['grades', 'gpa', 'classification', 'marks', 'degree'] },
  { path: '/about', title: 'About DSBA Hub', icon: 'Info', keywords: ['contributors', 'disclaimer', 'credits'] },
].map((p) => ({ ...p, id: `page:${p.path}`, group: 'pages', kind: 'page', to: p.path }));

/** Relative day phrase for an event: 'in 28 days', 'tomorrow', 'today', '3 days ago', '5 months ago'. */
export function relativeDay(date, now = new Date()) {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const d = Math.round((date.getTime() - a.getTime()) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 60) return `in ${d} days`;
  if (d >= 60) return `in ${Math.round(d / 30)} months`;
  if (d > -60) return `${-d} days ago`;
  if (d > -365) return `${Math.round(-d / 30)} months ago`;
  return `${Math.round(-d / 365)} ${Math.round(-d / 365) === 1 ? 'year' : 'years'} ago`;
}

/** Event subtitle + timing, computed at query time (Date.now()). */
export function describeEvent(e, now = new Date()) {
  const when = eventDate(e);
  const days = Math.round((when.getTime() - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  const date = when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return { when, days, past: days < 0, subtitle: `${EVENT_TYPES[e.type]?.label || 'Event'}, ${date}`, rel: relativeDay(when, now) };
}

// ── Lazy cross-feature sources ─────────────────────────────────────────
let sources = null;
let promise = null;

function pick(result, name) {
  if (result.status !== 'fulfilled') {
    console.error(`[DSBA Hub] Search could not load ${name}:`, result.reason);
    return null;
  }
  const fn = result.value?.[name];
  return typeof fn === 'function' ? fn : null;
}

/** Start loading the library/forum/newsletter search functions (idempotent). */
export function loadSources() {
  if (!promise) {
    promise = Promise.allSettled([import('../library/public.js'), import('../forum/public.js'), import('../newsletter/public.js')]).then(([lib, forum, nl]) => {
      sources = { searchFiles: pick(lib, 'searchFiles'), searchThreads: pick(forum, 'searchThreads'), searchIssues: pick(nl, 'searchIssues') };
      return sources;
    });
  }
  return promise;
}

/** The loaded sources, or null while loading. */
export function getSources() {
  return sources;
}

/** Call another feature's search safely: always an array. */
export function safeSearch(fn, query) {
  if (!fn || !query) return [];
  try {
    const out = fn(query);
    return Array.isArray(out) ? out.filter(Boolean) : [];
  } catch (err) {
    console.error('[DSBA Hub] A search source failed:', err);
    return [];
  }
}
