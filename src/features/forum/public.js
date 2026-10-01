// Public API of the forum feature (agent D). Signatures are a contract — do not change them.
// Threads = seed data (src/features/forum/data) + the student's own posts, votes and replies
// (localStorage 'dsba.forum.v1'), so Home, the module page and ⌘K see what the forum shows.
import { buildForum, hotList, searchIn, toPublicThread } from './lib/model.js';
import { FORUM_KEY, normalizeState } from './lib/store.js';

export { HotThreads } from './HotThreads.jsx'; // component for Home ({ n = 5 })
export { ModuleThreads } from './ModuleThreads.jsx'; // component for the module page Discussion tab ({ moduleId })

// Rebuild only when the stored activity changes (these run during other features' renders).
let cache = { raw: undefined, threads: [] };
function currentThreads() {
  let raw = null;
  try {
    raw = typeof window === 'undefined' ? null : window.localStorage.getItem(FORUM_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) {
    let state;
    try {
      state = normalizeState(raw ? JSON.parse(raw) : null);
    } catch {
      state = normalizeState(null);
    }
    cache = { raw, threads: buildForum(state).threads };
  }
  return cache.threads;
}

/**
 * The n hottest threads (pinned guidelines excluded). With `year`, that cohort's threads plus
 * forum-wide ones (General, study groups without a module).
 * -> [{ id, title, votes, replies, year, moduleId, author, createdAt (ISO) }]
 *    (+ category, tags, answered, excerpt, url)
 */
export function getHotThreads(n = 5, { year } = {}) {
  try {
    return hotList(currentThreads(), n, year).map(toPublicThread);
  } catch {
    return [];
  }
}

/**
 * Threads matching every word of `query` (title, module code/name, tags, body, replies),
 * best first; falls back to partial matches. Empty query → [].
 * -> same shape as getHotThreads + snippet
 */
export function searchThreads(query) {
  try {
    const q = String(query ?? '').trim();
    if (!q) return [];
    const threads = currentThreads();
    let hits = searchIn(threads, q, { mode: 'all', limit: 20 });
    if (!hits.length) hits = searchIn(threads, q, { mode: 'any', minScore: 4, limit: 10 });
    return hits.map((t) => ({ ...toPublicThread(t), snippet: t.excerpt }));
  } catch {
    return [];
  }
}
