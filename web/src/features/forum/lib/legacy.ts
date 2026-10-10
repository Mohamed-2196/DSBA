// The prototype kept a pretend forum in the browser (localStorage 'dsba.forum.v1': "your" threads, votes and replies,
// plus the launch film's 'hub.forum.hidden'). The forum now lives on the server: forget those, once per page load.
// An unfinished draft is the one thing worth keeping: it moves to the composer's current key.

const OLD_STORE = 'dsba.forum.v1';
const OLD_FILM_HOOK = 'hub.forum.hidden';
const OLD_DRAFT = 'dsba.forum.draft.v1';
export const DRAFT_KEY = 'dsba.forum.draft.v2';

let done = false;

export function forgetPrototypeForum(): void {
  if (done || typeof window === 'undefined') return;
  done = true;
  try {
    const ls = window.localStorage;
    const old = ls.getItem(OLD_DRAFT);
    if (old && ls.getItem(DRAFT_KEY) === null) {
      const d: unknown = JSON.parse(old);
      if (d && typeof d === 'object') {
        const { title, body, moduleId, category, tags } = d as Record<string, unknown>;
        if (typeof title === 'string' && typeof body === 'string' && (title.trim() || body.trim())) {
          ls.setItem(DRAFT_KEY, JSON.stringify({ title, body, moduleId, category, tags, savedAt: Date.now() }));
        }
      }
    }
    for (const key of [OLD_STORE, OLD_FILM_HOOK, OLD_DRAFT]) ls.removeItem(key);
  } catch {
    /* storage unavailable or an unreadable old draft: nothing to keep */
  }
}

/** Remove the composer's draft when it belongs to this account (on sign-out). */
export function forgetDraftOf(userId: string): void {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const owner = raw ? (JSON.parse(raw) as { owner?: unknown } | null)?.owner : undefined;
    if (owner === userId) window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable or unreadable: nothing to remove */
  }
}
