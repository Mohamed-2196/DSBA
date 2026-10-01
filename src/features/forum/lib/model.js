// Pure forum model: seed threads + the student's own activity (from the store) → threads with
// derived fields (votes, replies, answered, hot score…), plus sorting, search and sidebar queries.
// Deterministic: seed times are relative to the moment this module loads (Date.now()).
import { getModule } from '../../../data/modules.js';
import { SEED_THREADS } from '../data/threads.js';
import { getCategory, getTag } from '../data/taxonomy.js';
import { getAuthor, ME_ID } from '../data/authors.js';
import { excerpt, toPlainText } from './markdown.js';

export const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Threads younger than this get the highlighter "New" mark. */
export const NEW_FOR_MS = 2 * HOUR;

const SEED_NOW = Date.now();

function yearOf(category, moduleId) {
  const cat = getCategory(category);
  if (cat?.year) return cat.year;
  const mod = moduleId ? getModule(moduleId) : null;
  return mod ? mod.year : null;
}

function materializeSeed(now) {
  return SEED_THREADS.map((t) => {
    const replies = [];
    for (const r of t.replies || []) {
      const rid = `${t.id}:${r.id}`;
      replies.push({ id: rid, threadId: t.id, parentId: null, authorId: r.author, authorYear: null, body: r.body, createdAt: now - r.ago * MINUTE, baseVotes: r.votes || 0 });
      for (const c of r.replies || []) {
        replies.push({ id: `${t.id}:${c.id}`, threadId: t.id, parentId: rid, authorId: c.author, authorYear: null, body: c.body, createdAt: now - c.ago * MINUTE, baseVotes: c.votes || 0 });
      }
    }
    return {
      id: t.id,
      title: t.title,
      body: t.body,
      category: t.category,
      moduleId: t.moduleId || null,
      tags: t.tags || [],
      authorId: t.author,
      authorYear: null,
      createdAt: now - t.ago * MINUTE,
      baseVotes: t.votes || 0,
      pinned: !!t.pinned,
      seedAccepted: t.accepted ? `${t.id}:${t.accepted}` : null,
      replies,
    };
  });
}

const SEED = materializeSeed(SEED_NOW);
export const SEED_IDS = new Set(SEED.map((t) => t.id));

/** Hot = engagement over age (HN-style gravity). */
export function hotScore(votes, replies, ageMs) {
  const hours = Math.max(0, ageMs) / HOUR;
  return (votes + 1.5 * replies) / Math.pow(hours + 2, 1.5);
}

function userThreadBase(t) {
  return { ...t, tags: Array.isArray(t.tags) ? t.tags : [], baseVotes: 0, pinned: false, seedAccepted: null, replies: [] };
}

/**
 * Merge seed + store into display-ready threads.
 * @param {{threads, replies, votes, accepted}} state  normalised store state
 * @returns {{ threads: Thread[], byId: Map<string, Thread> }}
 */
export function buildForum(state, now = Date.now()) {
  const votes = state.votes || {};
  const extraReplies = state.replies || {};
  const base = [...(state.threads || []).map(userThreadBase), ...SEED];

  const threads = base.map((t) => {
    const replies = [...t.replies, ...(extraReplies[t.id] || [])]
      .map((r) => {
        const voted = !!votes[`r:${r.id}`];
        return { ...r, parentId: r.parentId || null, baseVotes: r.baseVotes || 0, votes: (r.baseVotes || 0) + (voted ? 1 : 0), voted };
      })
      .sort((a, b) => a.createdAt - b.createdAt);
    const ids = new Set(replies.map((r) => r.id));
    const wanted = Object.prototype.hasOwnProperty.call(state.accepted || {}, t.id) ? state.accepted[t.id] : t.seedAccepted;
    const acceptedId = wanted && ids.has(wanted) ? wanted : null;
    const voted = !!votes[`t:${t.id}`];
    const tVotes = t.baseVotes + (voted ? 1 : 0);
    const mod = t.moduleId ? getModule(t.moduleId) : null;
    const lastActivityAt = replies.length ? Math.max(t.createdAt, replies[replies.length - 1].createdAt) : t.createdAt;
    const participants = [...new Set([t.authorId, ...replies.map((r) => r.authorId)])];
    const plainBody = toPlainText(t.body);
    const tagLabels = t.tags.map((id) => getTag(id)?.label || id);
    return {
      ...t,
      module: mod,
      moduleId: mod ? mod.id : null,
      year: yearOf(t.category, mod?.id),
      votes: tVotes,
      voted,
      replies,
      replyCount: replies.length,
      acceptedId,
      answered: !!acceptedId,
      lastActivityAt,
      participants,
      excerpt: excerpt(t.body, 200),
      isMine: t.authorId === ME_ID,
      isNew: now - t.createdAt < NEW_FOR_MS,
      hot: hotScore(tVotes, replies.length, now - t.createdAt),
      search: {
        title: t.title.toLowerCase(),
        meta: [mod?.unitCode, mod?.name, mod?.shortName, getCategory(t.category)?.label, ...tagLabels, ...t.tags].filter(Boolean).join(' ').toLowerCase(),
        body: plainBody.toLowerCase(),
        replies: replies.map((r) => toPlainText(r.body)).join(' ').toLowerCase(),
      },
    };
  });
  return { threads, byId: new Map(threads.map((t) => [t.id, t])) };
}

// ── Sorting & filtering ─────────────────────────────────────────────────────────────────────

export const SORTS = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
];

export function sortThreads(list, sort = 'hot') {
  const arr = [...list];
  if (sort === 'new') arr.sort((a, b) => b.createdAt - a.createdAt);
  else if (sort === 'top') arr.sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt);
  else arr.sort((a, b) => b.hot - a.hot || b.createdAt - a.createdAt);
  return arr;
}

/** The n hottest threads for a cohort (its own threads + forum-wide ones), pinned excluded. */
export function hotList(threads, n = 5, year = null) {
  const y = Number(year);
  const scoped = y === 1 || y === 2 || y === 3;
  return sortThreads(threads.filter((t) => !t.pinned && (!scoped || t.year == null || t.year === y)), 'hot').slice(0, Math.max(0, n));
}

/** Replies of a thread as [{ ...reply, children: [] }] (one level), ordered for display. */
export function nestReplies(thread, order = 'top') {
  const top = [];
  const byParent = new Map();
  for (const r of thread.replies) {
    if (r.parentId && thread.replies.some((p) => p.id === r.parentId)) {
      if (!byParent.has(r.parentId)) byParent.set(r.parentId, []);
      byParent.get(r.parentId).push(r);
    } else top.push(r);
  }
  const rank = (r) => (r.id === thread.acceptedId ? 1 : 0);
  if (order === 'top') top.sort((a, b) => rank(b) - rank(a) || b.votes - a.votes || a.createdAt - b.createdAt);
  else top.sort((a, b) => rank(b) - rank(a) || a.createdAt - b.createdAt);
  return top.map((r) => ({ ...r, children: byParent.get(r.id) || [] }));
}

// ── Search ──────────────────────────────────────────────────────────────────────────────────

const STOP = new Set(
  'a an and are as at be but by can could do does for from get got has have how i if in into is it its me my of on or our should so than that the their them then there these this to was we were what when where which who why will with would you your any anyone someone just about vs'.split(' '),
);

export function tokenize(query) {
  return [...new Set(String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w))))];
}

function scoreThread(t, terms) {
  let score = 0;
  let matched = 0;
  for (const term of terms) {
    let s = 0;
    if (t.search.title.includes(term)) s += 6;
    if (t.search.meta.includes(term)) s += 4;
    if (t.search.body.includes(term)) s += 2;
    if (t.search.replies.includes(term)) s += 1;
    if (s) matched += 1;
    score += s;
  }
  return { score, matched };
}

/**
 * Rank threads for a query.
 * mode 'all': every term must match somewhere (list search, ⌘K).
 * mode 'any': at least one strong match (similar threads while composing).
 */
export function searchIn(threads, query, { mode = 'all', limit = Infinity, minScore = 1 } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const hits = [];
  for (const t of threads) {
    const { score, matched } = scoreThread(t, terms);
    if (score < minScore) continue;
    if (mode === 'all' && matched < terms.length) continue;
    hits.push({ t, score: score * (matched / terms.length) + Math.log2(2 + t.votes) * 0.25 });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.t);
}

/** Words of `query` worth marking in a title (for search highlighting). */
export function highlightTerms(query) {
  return tokenize(query).filter((w) => w.length > 1);
}

// ── Sidebar & thread-page queries ───────────────────────────────────────────────────────────

/** Counts for the filter bar and the sidebar. */
export function forumStats(threads, now = Date.now()) {
  const byCategory = {};
  let repliesToday = 0;
  let noReplies = 0;
  for (const t of threads) {
    byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    if (!t.replyCount) noReplies += 1;
    for (const r of t.replies) if (now - r.createdAt < DAY) repliesToday += 1;
  }
  return { total: threads.length, byCategory, repliesToday, noReplies };
}

/** Top contributors over the last 7 days: helpful votes on their replies + 10 per accepted answer. */
export function topContributors(threads, now = Date.now(), n = 5) {
  const since = now - 7 * DAY;
  const map = new Map();
  for (const t of threads) {
    for (const r of t.replies) {
      if (r.createdAt < since || r.authorId === 'pulse' || r.authorId === 'everyone') continue;
      const e = map.get(r.authorId) || { authorId: r.authorId, authorYear: r.authorYear, replies: 0, votes: 0, accepted: 0 };
      e.replies += 1;
      e.votes += r.votes;
      if (t.acceptedId === r.id) e.accepted += 1;
      map.set(r.authorId, e);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, author: getAuthor(e.authorId, e.authorYear), score: e.votes + e.accepted * 10 }))
    .sort((a, b) => b.score - a.score || b.replies - a.replies)
    .slice(0, n);
}

/** Threads related to `thread`: same module first, then shared tags and category. */
export function relatedThreads(threads, thread, n = 4) {
  return threads
    .filter((t) => t.id !== thread.id && !t.pinned)
    .map((t) => {
      let s = 0;
      if (thread.moduleId && t.moduleId === thread.moduleId) s += 6;
      if (t.category === thread.category) s += 2;
      if (thread.year && t.year === thread.year) s += 1;
      s += t.tags.filter((x) => thread.tags.includes(x)).length * 2;
      return { t, s: s + Math.min(2, t.hot) };
    })
    .filter((x) => x.s >= 3)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.t);
}

/** Shape returned by the public API (features/forum/public.js). */
export function toPublicThread(t) {
  return {
    id: t.id,
    title: t.title,
    votes: t.votes,
    replies: t.replyCount,
    year: t.year,
    moduleId: t.moduleId,
    // The person's name ('Maryam S.' for the signed-in student); the forum's own UI says "You".
    author: getAuthor(t.authorId, t.authorYear).name,
    createdAt: new Date(t.createdAt).toISOString(),
    // extras (additive, safe to ignore)
    authorId: t.authorId,
    category: t.category,
    tags: [...t.tags],
    answered: t.answered,
    excerpt: t.excerpt,
    url: `/forum/${t.id}`,
  };
}
