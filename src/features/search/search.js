// Query → grouped results for the palette.
import { getModule } from '../../data/modules.js';
import { CONTRIBUTE_URL, MYCLASS_URL, UOL_PORTAL_URL, getStudent } from '../../data/people.js';
import { scoreEntry, tokenize } from './match.js';
import { EVENT_ENTRIES, LESSON_ENTRIES, MODULE_ENTRIES, PAGE_ENTRIES, describeEvent, safeSearch } from './sources.js';

export const GROUPS = {
  recent: { label: 'Recent searches' },
  suggested: { label: 'Try searching for' },
  modules: { label: 'Modules', cap: 4, noun: 'modules' },
  lessons: { label: 'Lessons', cap: 3, noun: 'lessons' },
  files: { label: 'Library', cap: 3, noun: 'files' },
  threads: { label: 'Forum', cap: 3, noun: 'threads' },
  issues: { label: 'The Pulse', cap: 2, noun: 'issues' },
  events: { label: 'Calendar', cap: 3, noun: 'dates' },
  actions: { label: 'Actions', cap: 3, noun: 'actions' },
  pages: { label: 'Pages', cap: 3, noun: 'pages' },
  quick: { label: 'Quick actions' },
  goto: { label: 'Go to' },
  fallback: { label: 'Search somewhere else' },
};
const CONTENT_ORDER = ['modules', 'lessons', 'files', 'threads', 'issues', 'events'];
// How much a group's best match counts when ordering groups (a module is the canonical answer).
const GROUP_WEIGHT = { modules: 1.25, lessons: 1, files: 1.05, threads: 1, issues: 0.95, events: 0.8 };

export const SUGGESTIONS = ['Econometrics', 'Past papers', 'Regression', 'ST2133'];

/** Actions depend on the current year and theme. */
export function buildActions({ year, theme }) {
  return [
    { id: 'action:new-thread', title: 'Start a thread', icon: 'PencilSimpleLine', keywords: ['new thread', 'ask a question', 'post', 'forum'], to: '/forum/new' },
    ...[1, 2, 3]
      .filter((y) => y !== year)
      .map((y) => ({ id: `action:year-${y}`, title: `Switch to Year ${y}`, icon: 'ArrowsLeftRight', keywords: ['change year', 'cohort', `y${y}`], run: { type: 'year', year: y }, year: y })),
    {
      id: 'action:theme',
      title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      icon: theme === 'dark' ? 'Sun' : 'Moon',
      keywords: ['theme', 'dark mode', 'light mode', 'toggle theme', 'appearance', 'night'],
      run: { type: 'theme' },
    },
    { id: 'action:grades', title: 'Calculate my grade', icon: 'Calculator', keywords: ['gpa', 'classification', 'grade calculator', 'marks'], to: '/grades' },
    { id: 'action:contribute', title: 'Contribute a resource', icon: 'GithubLogo', keywords: ['github', 'share notes', 'upload', 'issue'], href: CONTRIBUTE_URL },
    { id: 'action:myclass', title: 'Open BIBF MyClass', icon: 'GraduationCap', keywords: ['myclass', 'bibf'], href: MYCLASS_URL },
    { id: 'action:uol', title: 'Open the UoL student portal', icon: 'Bank', keywords: ['uol', 'university of london', 'portal'], href: UOL_PORTAL_URL },
  ].map((a) => ({ ...a, group: 'actions', kind: 'action' }));
}

const KIND_LABELS = {
  'past-paper': 'Past paper',
  'examiners-report': 'Examiners’ report',
  'subject-guide': 'Subject guide',
  reading: 'Essential reading',
  'study-guide': 'Study guide',
  exercises: 'Exercise set',
  notes: 'Students’ notes',
  'cheat-sheet': 'Cheat sheet',
};
function kindLabel(kind) {
  if (!kind) return 'File';
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  const s = String(kind).replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function authorName(a) {
  if (!a) return null;
  if (typeof a === 'object') return a.name || null;
  return getStudent(a)?.name || String(a);
}

const codeOf = (moduleId) => {
  const m = getModule(moduleId);
  return m ? m.unitCode || m.shortName : null;
};

function fileEntry(f) {
  const code = f.moduleCode || codeOf(f.moduleId);
  return {
    id: `file:${f.id}`,
    group: 'files',
    kind: 'file',
    year: f.year,
    title: String(f.title || 'Untitled file'),
    subtitle: `${f.kindLabel || kindLabel(f.kind)}${code ? ` for ${code}` : ''}${f.pages ? `, ${f.pages} ${f.pages === 1 ? 'page' : 'pages'}` : ''}`,
    format: f.format,
    isNew: !!f.isNew,
    to: `/library/${encodeURIComponent(f.id)}`,
  };
}

function threadEntry(t) {
  const code = codeOf(t.moduleId);
  const who = authorName(t.author);
  const replies = typeof t.replies === 'number' ? t.replies : Array.isArray(t.replies) ? t.replies.length : null;
  return {
    id: `thread:${t.id}`,
    group: 'threads',
    kind: 'thread',
    year: t.year,
    title: String(t.title || 'Untitled thread'),
    subtitle: [code, who ? `by ${who}` : null].filter(Boolean).join(', ') || 'Forum thread',
    meta: replies != null ? `${replies} ${replies === 1 ? 'reply' : 'replies'}` : null,
    to: `/forum/${encodeURIComponent(t.id)}`,
  };
}

function issueEntry(i) {
  return {
    id: `issue:${i.slug}`,
    group: 'issues',
    kind: 'issue',
    title: String(i.title || `Issue ${i.number}`),
    subtitle: i.snippet ? String(i.snippet) : `The Pulse, issue ${i.number}`,
    number: i.number,
    to: `/newsletter/${encodeURIComponent(i.slug)}`,
  };
}

/**
 * Score a list; external results (already matched by their feature) keep a floor score.
 * tier + compare: results within the same score band are ordered by `compare` (e.g. date).
 */
function rank(entries, tokens, query, { year, floor = 0, extraBoost, tier = 0, compare } = {}) {
  const out = [];
  entries.forEach((e, i) => {
    let s = scoreEntry(e, tokens, query);
    if (!s && floor) s = floor;
    if (!s) return;
    if (year && e.year === year) s += 12;
    if (extraBoost) s += extraBoost(e);
    out.push({ e, s, i });
  });
  if (tier && compare) out.sort((a, b) => Math.floor(b.s / tier) - Math.floor(a.s / tier) || compare(a.e, b.e) || a.i - b.i);
  else out.sort((a, b) => b.s - a.s || a.i - b.i);
  return out;
}

/**
 * Run a query.
 * @returns {{ groups: Array<{ id, label, items, total, hidden }>, count: number }}
 *   items are entries; a group with hidden > 0 ends with a { kind: 'more' } row.
 */
// "year 3", "y3", "Year 2 stats": a cohort filter rather than words to match.
const YEAR_RE = /\b(?:year\s*|y)([123])\b/i;

export function runSearch(query, { year, theme, sources, expanded = new Set(), recent = [] }) {
  const yearMatch = String(query || '').match(YEAR_RE);
  const cohort = yearMatch ? Number(yearMatch[1]) : null;
  const text = yearMatch ? query.replace(yearMatch[0], ' ') : query;
  const tokens = tokenize(text);
  const actions = buildActions({ year, theme });
  const inCohort = (e) => !cohort || e.year == null || e.year === cohort;

  if (cohort && !tokens.length) {
    const groups = [];
    const sw = actions.find((a) => a.id === `action:year-${cohort}`);
    if (sw) groups.push({ id: 'actions', items: [sw], total: 1 });
    const mods = MODULE_ENTRIES.filter((e) => e.year === cohort);
    groups.push({ id: 'modules', items: mods, total: mods.length });
    return finish(groups, groups.reduce((n, g) => n + g.total, 0));
  }

  if (!tokens.length) {
    const groups = [];
    if (recent.length) groups.push({ id: 'recent', items: recent.map((q) => ({ id: `recent:${q}`, kind: 'recent', group: 'recent', title: q, query: q })) });
    else groups.push({ id: 'suggested', items: SUGGESTIONS.map((q) => ({ id: `suggest:${q}`, kind: 'suggestion', group: 'suggested', title: q, query: q })) });
    groups.push({ id: 'quick', items: actions.filter((a) => ['action:new-thread', 'action:theme'].includes(a.id) || a.id.startsWith('action:year-')).map((a) => ({ ...a, group: 'quick' })) });
    groups.push({ id: 'goto', items: PAGE_ENTRIES.filter((p) => p.path !== '/about').map((p) => ({ ...p, group: 'goto' })) });
    return finish(groups, 0);
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const q = text.trim();
  const ranked = {
    modules: rank(MODULE_ENTRIES.filter(inCohort), tokens, q, { year }),
    lessons: rank(LESSON_ENTRIES.filter(inCohort), tokens, q, { year }),
    files: rank(safeSearch(sources?.searchFiles, q).map(fileEntry).filter(inCohort), tokens, q, { year, floor: 18 }),
    threads: rank(safeSearch(sources?.searchThreads, q).map(threadEntry).filter(inCohort), tokens, q, { year, floor: 18 }),
    issues: rank(safeSearch(sources?.searchIssues, q).map(issueEntry), tokens, q, { floor: 18 }),
    // Dates: strong vs weak matches first, then upcoming before past, your year first, soonest first.
    events: rank(EVENT_ENTRIES.filter(inCohort), tokens, q, {
      year,
      tier: 40,
      compare: (a, b) => {
        const pa = a.event.date < todayISO;
        const pb = b.event.date < todayISO;
        if (pa !== pb) return pa ? 1 : -1;
        const ya = a.year == null || a.year === year ? 0 : 1;
        const yb = b.year == null || b.year === year ? 0 : 1;
        if (ya !== yb) return ya - yb;
        return pa ? b.event.date.localeCompare(a.event.date) : a.event.date.localeCompare(b.event.date);
      },
      extraBoost: (e) => (e.event.date < todayISO ? -10 : 6),
    }),
    actions: rank(actions, tokens, q),
    pages: rank(PAGE_ENTRIES, tokens, q),
  };

  // Drop weak matches (e.g. a word inside a module description) when something matches well.
  const top = Math.max(0, ...Object.values(ranked).map((l) => (l.length ? l[0].s : 0)));
  if (top >= 60) for (const id of Object.keys(ranked)) ranked[id] = ranked[id].filter((r) => r.s >= top * 0.25);

  const best = (id) => (ranked[id].length ? ranked[id][0].s : 0);
  // Content groups by their best match (ties keep the usual order); actions and pages go first
  // only when they beat all content ("dark", "grades"), otherwise last.
  const weighted = (id) => best(id) * GROUP_WEIGHT[id];
  const order = [...CONTENT_ORDER].sort((a, b) => weighted(b) - weighted(a) || CONTENT_ORDER.indexOf(a) - CONTENT_ORDER.indexOf(b));
  const contentBest = Math.max(...CONTENT_ORDER.map(best));
  const tail = ['actions', 'pages'].sort((a, b) => best(b) - best(a));
  for (const id of [...tail].reverse()) if (best(id) > contentBest) order.unshift(id);
  for (const id of tail) if (!order.includes(id)) order.push(id);

  let count = 0;
  const groups = [];
  for (const id of order) {
    const list = ranked[id];
    if (!list.length) continue;
    count += list.length;
    const cap = expanded.has(id) ? Infinity : GROUPS[id].cap;
    let items = list.slice(0, cap).map(({ e }) => (e.kind === 'event' ? { ...e, ...describeEvent(e.event, now) } : e));
    const hidden = list.length - items.length;
    if (hidden > 0) items = [...items, { id: `more:${id}`, kind: 'more', group: id, title: `Show ${hidden} more ${GROUPS[id].noun}`, target: id }];
    groups.push({ id, items, total: list.length, hidden });
  }

  if (!groups.length) {
    const q = query.trim();
    groups.push({
      id: 'fallback',
      items: [
        { id: 'fallback:library', kind: 'fallback', icon: 'Books', title: `Search the library for “${q}”`, to: `/library?q=${encodeURIComponent(q)}` },
        { id: 'fallback:forum', kind: 'fallback', icon: 'ChatsCircle', title: `Search the forum for “${q}”`, to: `/forum?q=${encodeURIComponent(q)}` },
        { id: 'fallback:ask', kind: 'fallback', icon: 'PencilSimpleLine', title: `Ask the forum about “${q}”`, to: `/forum/new?title=${encodeURIComponent(q)}` },
      ].map((x) => ({ ...x, group: 'fallback' })),
    });
    return { ...finish(groups, 0), empty: true };
  }
  return finish(groups, count);
}

function finish(groups, count) {
  return { groups: groups.map((g) => ({ ...g, label: GROUPS[g.id].label })), count };
}
