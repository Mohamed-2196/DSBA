// The unfinished thread kept on this device (localStorage DRAFT_KEY) until it is posted or discarded. Signing out
// removes it (auth/queries.ts PERSONAL_STORAGE_PREFIXES). Plain functions: the composer (NewThreadPage) holds the state.
import type { CategoryId } from '../types';
import { isCategoryId } from './categories';
import { TITLE_MAX } from './threadForm';

export const DRAFT_KEY = 'hub.mine.forum.draft';

/** What the composer holds. */
export interface ThreadForm {
  title: string;
  body: string;
  category: CategoryId;
  /** '' = no specific module */
  moduleId: string;
  tags: string[];
}

export interface ThreadDraft extends ThreadForm {
  savedAt: number;
  /** who wrote it: an account id, or null for a guest (a shared computer must not show one student's draft to the next) */
  owner?: string | null;
}

/** Anything stored under the key that looks like a draft (stored JSON is never trusted as it is). */
export function isDraft(v: unknown): v is ThreadDraft {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return typeof d.title === 'string' && typeof d.body === 'string';
}

export function hasText(form: Pick<ThreadForm, 'title' | 'body'>): boolean {
  return !!(form.title.trim() || form.body.trim());
}

/** Whose draft it is, from this viewer's side: theirs (or a guest's, which whoever signs in may pick up), or someone else's. */
export function draftOwner(raw: unknown, viewer: string | null): 'none' | 'mine' | 'other' {
  if (!isDraft(raw) || !hasText(raw)) return 'none';
  return raw.owner == null || raw.owner === viewer ? 'mine' : 'other';
}

/**
 * The draft as a form this viewer may continue, or null. `knownModule` and `knownTag` keep what the API still has
 * (a draft can outlive a module or a tag); the category falls back to `fallbackCategory`.
 */
export function restoreDraft(
  raw: unknown,
  viewer: string | null,
  { knownModule, fallbackCategory, maxTags }: { knownModule: (id: string) => boolean; fallbackCategory: CategoryId; maxTags: number },
): ThreadForm | null {
  if (draftOwner(raw, viewer) !== 'mine' || !isDraft(raw)) return null;
  return {
    title: raw.title.slice(0, TITLE_MAX),
    body: raw.body,
    moduleId: typeof raw.moduleId === 'string' && knownModule(raw.moduleId) ? raw.moduleId : '',
    category: isCategoryId(raw.category) ? raw.category : fallbackCategory,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string').slice(0, maxTags) : [],
  };
}
