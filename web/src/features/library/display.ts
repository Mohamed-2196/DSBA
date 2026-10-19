// Display strings for library items (sentence case, short).
import type { ModuleSummary } from '../../api/types';
import { formatSize } from '../../api/uploads';
import { hostOf } from '../../lib/share';
import { timeAgo } from '../../ui';
import { sittingLabel, zoneLabel } from '../../lib/exams';
import { EXAM_KINDS, formatOf, kindLabel, type ItemStatus } from './kinds';
import type { LibraryItem, LibrarySort } from './types';

const WEEK = 7 * 24 * 3600 * 1000;

/** When the item reached the library (published), or when it was uploaded while it waits. */
export function addedAt(item: Pick<LibraryItem, 'publishedAt' | 'createdAt'>): string {
  return item.publishedAt ?? item.createdAt;
}

/**
 * Shared by someone in the last 7 days. Seeded links and imported files have no uploader: they came with the
 * library, so they aren't news.
 */
export function isNew(item: Pick<LibraryItem, 'publishedAt' | 'status' | 'uploadedBy'>, now = Date.now()): boolean {
  return (
    item.status === 'published' &&
    !!item.uploadedBy &&
    !!item.publishedAt &&
    now - new Date(item.publishedAt).getTime() < WEEK
  );
}

export function downloadsLabel(n: number): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? 'download' : 'downloads'}`;
}

const PLACES: Record<string, string> = { 'drive.google.com': 'Google Drive', 'docs.google.com': 'Google Drive' };

/** Where a link leads, in words: 'Google Drive', or its host ('vle.london.ac.uk'). */
export function linkPlace(item: Pick<LibraryItem, 'url'>): string {
  const host = hostOf(item.url);
  return PLACES[host] ?? (host || 'another site');
}

/** 'PDF, 2.4 MB' for files; the host for links. */
export function sizeLabel(item: LibraryItem): string {
  if (item.source === 'link') return linkPlace(item);
  const f = formatOf(item);
  const size = formatSize(item.sizeBytes);
  return [f?.tag, size].filter(Boolean).join(', ');
}

/** Short module tag: the unit code, or the short name (Year 3 modules have no code). */
export function moduleTag(m: Pick<ModuleSummary, 'unitCode' | 'shortName'> | null | undefined): string | null {
  return m ? m.unitCode || m.shortName : null;
}

type ExamTitled = Pick<LibraryItem, 'title' | 'kind' | 'examYear' | 'examSession' | 'zone'>;

/**
 * The name a file of a sitting goes by in lists, built from its exam year, session and zone: 'ST2133 · May 2019 ·
 * Zone A', 'ST2133 · October 2023 · Examiners’ report'. `module` leads it (the module's tag), unless the list is the
 * module's own (null). Other files, and papers without an exam year, keep their title. The API's twin is
 * exam_title() in api/app/services/library.py (search results).
 */
export function examTitle(item: ExamTitled, module: string | null): string {
  if (!item.examYear || !EXAM_KINDS.has(item.kind)) return item.title;
  const parts = [module, sittingLabel(item.examYear, item.examSession)];
  if (item.zone) parts.push(zoneLabel(item.zone));
  if (item.kind !== 'past-paper') parts.push(kindLabel(item.kind));
  return parts.filter(Boolean).join(' · ');
}

/** Whether examTitle() names the item by its sitting rather than its title. */
export function hasExamTitle(item: ExamTitled): boolean {
  return !!item.examYear && EXAM_KINDS.has(item.kind);
}

/**
 * Who a file comes from, for students' notes and the like: the author's credit ('By Mahdi'), or the student who
 * shared it ('Shared by Sara A. · Year 3', or their badge, 'Student rep'). Null for files of a sitting, whose
 * sitting is what matters, and for files nobody shared (the imported library).
 */
export function sharedBy(item: Pick<LibraryItem, 'kind' | 'authorName' | 'uploadedBy'>): string | null {
  if (EXAM_KINDS.has(item.kind)) return null;
  if (item.authorName) return `By ${item.authorName}`;
  const who = item.uploadedBy;
  if (!who) return null;
  const tag = who.badge ?? (who.year ? `Year ${who.year}` : null);
  return tag ? `Shared by ${who.displayName} · ${tag}` : `Shared by ${who.displayName}`;
}

/**
 * "Ask about this paper": a new forum thread about the item's module, its details starting with a link to the item
 * (`url`: the item's full address, appUrl(itemPath(item))).
 */
export function askAboutHref(item: Pick<LibraryItem, 'moduleId'>, name: string, url: string): string {
  const q = new URLSearchParams();
  if (item.moduleId) q.set('module', item.moduleId);
  q.set('body', `About [${name.replace(/[[\]]/g, '')}](${url}):\n\n`);
  return `/forum/new?${q.toString()}`;
}

/** The one line of meta under a card, matching the sort. */
export function cardMeta(item: LibraryItem, sort: LibrarySort): string {
  if (sort === 'popular') return downloadsLabel(item.downloadCount);
  if (sort === 'sitting' && hasExamTitle(item)) return sizeLabel(item); // the title names the kind
  if (sort === 'title' || sort === 'relevance' || sort === 'sitting')
    return `${kindLabel(item.kind)}, ${sizeLabel(item)}`;
  return `Added ${timeAgo(addedAt(item))}`;
}

/**
 * The meta line on a file's index card: what it is, its format and size (or the site a link leads to), then what the
 * sort is about: 'Past paper · PDF, 260 KB · 12 downloads'. The kind is left out where the title already names it.
 */
export function rowMeta(item: LibraryItem, sort: LibrarySort): string {
  const named = hasExamTitle(item) && item.kind !== 'past-paper';
  const parts = [named ? null : kindLabel(item.kind), sizeLabel(item)];
  if (sort === 'popular') parts.push(downloadsLabel(item.downloadCount));
  else if (sort === 'new') parts.push(`added ${timeAgo(addedAt(item))}`);
  return parts.filter(Boolean).join(' · ');
}

export interface StatusInfo {
  label: string;
  tone: 'highlight' | 'alert' | 'neutral';
}

/** How an item that isn't public yet is labelled (null when published). */
export function statusInfo(status: ItemStatus): StatusInfo | null {
  if (status === 'pending') return { label: 'Waiting for review', tone: 'highlight' };
  if (status === 'rejected') return { label: 'Not published', tone: 'alert' };
  if (status === 'removed') return { label: 'Removed', tone: 'neutral' };
  return null;
}

/** Where a search found its words inside the file: 'Page 3: “…the Cramér–Rao bound…”', or just the words. */
export function matchLine(item: Pick<LibraryItem, 'match'>): string | null {
  const m = item.match;
  if (!m) return null;
  return m.page ? `Page ${m.page}: ${m.snippet}` : m.snippet;
}

/** ?page= on a file's address: a page number to open the PDF at, or null. */
export function pageParam(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : null;
}
