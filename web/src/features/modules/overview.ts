// The Overview tab's previews, as pure functions: who shared a file, and whether there is lesson progress worth
// showing.
import type { LibraryItem } from '../../api/types';
import type { ResumePoint } from './progress';

/** Who shared a file: the author it names, else the student who uploaded it; null when neither is known. */
export function sharedBy(item: Pick<LibraryItem, 'authorName' | 'uploadedBy'>): string | null {
  return item.authorName?.trim() || item.uploadedBy?.displayName || null;
}

/** The Overview shows lesson progress only to a student who keeps it and has started: nothing to continue, no block. */
export function showsProgress(tracking: boolean, resume: ResumePoint | null): resume is ResumePoint {
  return tracking && resume != null && resume.kind !== 'start';
}
