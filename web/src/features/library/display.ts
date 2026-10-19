// Display strings for library items (sentence case, short).
import type { ModuleSummary } from '../../api/types';
import { formatSize } from '../../api/uploads';
import { hostOf } from '../../lib/share';
import { timeAgo } from '../../ui';
import { formatOf, kindLabel, type ItemStatus } from './kinds';
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

/** The one line of meta under a card, matching the sort. */
export function cardMeta(item: LibraryItem, sort: LibrarySort): string {
  if (sort === 'popular') return downloadsLabel(item.downloadCount);
  if (sort === 'title' || sort === 'relevance') return `${kindLabel(item.kind)}, ${sizeLabel(item)}`;
  return `Added ${timeAgo(addedAt(item))}`;
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
