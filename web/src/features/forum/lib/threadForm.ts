// What a thread's and a reply's fields may be before they are sent, for the composer and the edit forms alike. The
// API has the last word (api/app/schemas/forum.py, services/forum/rules.py): these only catch what the browser can.
import { ApiError, placeFieldErrors } from '../../../api/errors';

/** A title says what is being asked: at least this long (the API takes 5; the forms ask a little more). */
export const TITLE_MIN = 8;
/** Titles stay short enough to read in a list (the API allows 160). */
export const TITLE_MAX = 120;
export const BODY_MAX = 20_000;
export const REPLY_MAX = 10_000;
/** A student rep's reason for hiding a post (ThreadModeration / ReplyModeration). */
export const REASON_MAX = 500;

export type ThreadField = 'title' | 'body' | 'category' | 'moduleId' | 'tags';
export type ThreadErrors = Partial<Record<ThreadField, string>>;

const FIELDS: readonly ThreadField[] = ['title', 'body', 'category', 'moduleId', 'tags'];

/** What is wrong with a title, in words for its author, or null. */
export function titleProblem(title: string): string | null {
  const t = title.trim();
  if (!t) return 'Add a title so classmates know what you’re asking.';
  if (t.length < TITLE_MIN)
    return `Make the title a little longer (at least ${TITLE_MIN} characters) so classmates know what you’re asking.`;
  return null;
}

/**
 * The fields an API refusal names, as the form's errors ("Pick a module from the list." under Module, "Pick up to 3
 * tags." under Tags, and a message about one tag under Tags too), or null when it names none of them: then the refusal is about the whole form (a rate limit,
 * the server), and the API's message says what to do.
 */
export function threadFieldErrors(e: unknown): ThreadErrors | null {
  if (!(e instanceof ApiError)) return null;
  const { fields } = placeFieldErrors(e.fields, FIELDS);
  return Object.keys(fields).length ? fields : null;
}

/** "120/500" once a text is close to its limit (the last fifth), so nobody is cut off without warning. */
export function remainingNote(length: number, max: number): string | null {
  return length >= max * 0.8 ? `${length}/${max}` : null;
}
