import type { QueryClient } from '@tanstack/react-query';
import { removeStored } from '../state';

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
 * Storage keys that hold a signed-in person's own things (recent searches, grades, the forum's unfinished thread,
 * Noora's chats). They are removed on sign-out and account deletion, because lab and library computers are shared.
 * Every per-person key starts with 'hub.mine.', in localStorage and in sessionStorage.
 */
export const PERSONAL_STORAGE_PREFIXES = ['hub.mine.'] as const;

const isPersonalKey = (key: string | null): key is string => key !== null && PERSONAL_STORAGE_PREFIXES.some((p) => key.startsWith(p));

/** The personal keys in one storage area (none when it is unavailable). */
function personalKeys(area: () => Storage): string[] {
  try {
    const store = area();
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (isPersonalKey(key)) keys.push(key);
    }
    return keys;
  } catch {
    return []; // storage unavailable: nothing was kept
  }
}

/**
 * Remove every personal key, and reset every mounted useLocalStorage() holding one (code quality review CQ-1). The
 * tab's own copies in sessionStorage go too.
 */
export function clearPersonalStorage(): void {
  for (const key of personalKeys(() => window.localStorage)) removeStored(key);
  const session = personalKeys(() => window.sessionStorage);
  try {
    for (const key of session) window.sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing was kept */
  }
}
