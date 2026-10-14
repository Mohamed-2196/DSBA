// Suggested videos on screen: their statuses, and the accept form's choice of chapter as the API wants it.
import type { SuggestionAccept, SuggestionOut } from '../../../api/types';

export type SuggestionStatus = SuggestionOut['status'];

export const STATUS_LABEL: Record<SuggestionStatus, { label: string; tone: 'outline' | 'signal' | 'neutral' }> = {
  pending: { label: 'Waiting for review', tone: 'outline' },
  accepted: { label: 'Added as a lesson', tone: 'signal' },
  declined: { label: 'Declined', tone: 'neutral' },
};

/** The accept form's chapter choice: a chapter's id, or NEW_CHAPTER for a new one at the end of the module. */
export const NEW_CHAPTER = '__new__';

/** What POST …/accept takes, or the field to fix ("newChapter" with no name, "chapterId" with nothing picked). */
export function acceptBody(
  choice: string,
  newChapter: string,
  title: string,
  suggestedTitle: string,
): { body: SuggestionAccept } | { error: 'chapterId' | 'newChapter' } {
  const name = newChapter.trim();
  const t = title.trim();
  const titled = t && t !== suggestedTitle ? { title: t } : {};
  if (choice === NEW_CHAPTER) return name ? { body: { newChapter: name, ...titled } } : { error: 'newChapter' };
  if (!choice) return { error: 'chapterId' };
  return { body: { chapterId: choice, ...titled } };
}
