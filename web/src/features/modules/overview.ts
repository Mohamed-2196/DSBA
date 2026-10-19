// The Overview tab's previews, as pure functions: the latest sittings of a module's past papers, who shared a file,
// and whether there is lesson progress worth showing.
import type { LibraryItem } from '../../api/types';
import { SESSIONS, ZONES, sittingKey, sittingLabel } from '../../lib/exams';
import type { ResumePoint } from './progress';

export interface SittingPreview {
  key: string;
  /** 'May 2025' */
  label: string;
  /** One paper per zone, in the library's zone order (a zone with two uploads keeps the newest). */
  papers: LibraryItem[];
}

const sessionRank = (item: Pick<LibraryItem, 'examSession'>): number =>
  item.examSession ? SESSIONS.indexOf(item.examSession) + 1 : 0;
const zoneRank = (item: Pick<LibraryItem, 'zone'>): number => (item.zone ? ZONES.indexOf(item.zone) : ZONES.length);

/** The `n` most recent sittings among a module's past papers, newest first. Papers without an exam year are left
 *  out: they have no sitting to show. */
export function latestSittings(papers: readonly LibraryItem[], n: number): SittingPreview[] {
  const bySitting = new Map<string, LibraryItem[]>();
  for (const p of papers) {
    const key = sittingKey(p);
    if (!key) continue;
    const group = bySitting.get(key) ?? [];
    if (!group.some((q) => q.zone === p.zone)) group.push(p);
    bySitting.set(key, group);
  }
  return [...bySitting.entries()]
    .map(([key, group]) => ({ key, group, first: group[0] }))
    .sort(
      (a, b) => (b.first.examYear ?? 0) - (a.first.examYear ?? 0) || sessionRank(b.first) - sessionRank(a.first),
    )
    .slice(0, n)
    .map(({ key, group, first }) => ({
      key,
      label: sittingLabel(first.examYear ?? 0, first.examSession),
      papers: [...group].sort((a, b) => zoneRank(a) - zoneRank(b)),
    }));
}

/** Who shared a file: the author it names, else the student who uploaded it; null when neither is known. */
export function sharedBy(item: Pick<LibraryItem, 'authorName' | 'uploadedBy'>): string | null {
  return item.authorName?.trim() || item.uploadedBy?.displayName || null;
}

/** The Overview shows lesson progress only to a student who keeps it and has started: nothing to continue, no block. */
export function showsProgress(tracking: boolean, resume: ResumePoint | null): resume is ResumePoint {
  return tracking && resume != null && resume.kind !== 'start';
}
