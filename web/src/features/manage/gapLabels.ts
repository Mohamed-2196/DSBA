// What Manage's Gaps screen says about each gap, and where each one is fixed.
import type { EventGap, GapModule, LessonGap, ScanGap, SittingGap } from '../../api/types';
import { countOf } from '../../ui';

/** 'ST2133 Advanced statistics', or the name alone when the module has no code. */
export const moduleName = (m: GapModule): string => (m.unitCode ? `${m.unitCode} ${m.name}` : m.name);

/** Where a module's papers and files are added. */
export const moduleFiles = (m: GapModule): string => `/modules/${encodeURIComponent(m.id)}?tab=files`;

/** The module in Manage's modules editor. */
export const moduleEditor = (m: GapModule): string => `/manage?tab=content&module=${encodeURIComponent(m.id)}`;

export const eventPath = (e: EventGap): string => `/calendar?event=${encodeURIComponent(e.id)}`;

export function sittingMissing(s: SittingGap): string {
  return s.missing === 'report' ? 'Has the paper, no examiners’ report' : 'Has the examiners’ report, no paper';
}

export function scanLine(s: ScanGap): string {
  return s.text === 'empty' ? 'A scan: search finds it by its title only' : 'Its text couldn’t be read';
}

export function lessonLine(g: LessonGap): string {
  const parts: string[] = [];
  if (g.lessons === 0)
    parts.push(g.chapters ? `No lessons in its ${countOf(g.chapters, 'chapter')}` : 'No chapters or lessons yet');
  else if (g.emptyChapters) parts.push(`${g.emptyChapters} of ${countOf(g.chapters, 'chapter')} have no lessons`);
  if (g.unavailable) parts.push(`${countOf(g.unavailable, 'video')} gone from YouTube`);
  return parts.join(' · ');
}

export function eventMissing(e: EventGap): string {
  if (e.noTime && e.noPlace) return 'No time or place';
  return e.noTime ? 'No time' : 'No place';
}
