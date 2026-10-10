import type { QueryClient } from '@tanstack/react-query';

/** The signed-in person (GET /me): Me, or null for a guest. */
export const ME_KEY = ['me'] as const;

// Queries that are the same for everyone and expensive to reload (the module catalogue), plus /me itself.
const SHARED_ROOTS = new Set<unknown>(['me', 'modules']);
const isPersonal = (key: readonly unknown[]) => !SHARED_ROOTS.has(key[0]);

/** After signing in: re-read everything that depends on who is asking (stars, votes, progress, notifications). */
export function refreshPersonalQueries(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ predicate: (q) => isPersonal(q.queryKey) });
}

/**
 * After signing out or deleting the account: forget what belonged to that person (so the next one on this
 * computer never sees it) and re-read what is on screen as a guest. Like queryClient.clear() for everything
 * personal, without reloading the module catalogue every page needs.
 */
export async function resetPersonalQueries(qc: QueryClient): Promise<void> {
  // One tick first: screens re-render as a guest, so queries that need an account switch off instead of
  // being re-read (and answering 401).
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await qc.resetQueries({ predicate: (q) => isPersonal(q.queryKey) });
}

/**
 * localStorage keys that hold a signed-in person's unfinished work (drafts). They are removed on sign-out and
 * account deletion, because lab and library computers are shared. New per-person keys: start them with 'hub.mine.'.
 */
const PERSONAL_STORAGE_PREFIXES = ['hub.mine.', 'dsba.forum.draft'];

export function clearPersonalStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && PERSONAL_STORAGE_PREFIXES.some((p) => key.startsWith(p))) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing was kept */
  }
}
