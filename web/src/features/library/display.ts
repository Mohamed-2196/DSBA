// Display strings for library items (sentence case, short).
import type { ModuleSummary } from '../../api/types';
import { timeAgo } from '../../ui';
import { formatOf, formatSize, kindLabel, type ItemStatus } from './kinds';
import type { LibraryItem, LibrarySort } from './types';

const WEEK = 7 * 24 * 3600 * 1000;

/** When the item reached the library (published), or when it was uploaded while it waits. */
export function addedAt(item: Pick<LibraryItem, 'publishedAt' | 'createdAt'>): string {
  return item.publishedAt ?? item.createdAt;
}

/**
 * Shared by someone in the last 7 days. Links imported from the old site have no uploader: they were loaded with
 * the library, so they aren't news.
 */
export function isNew(item: Pick<LibraryItem, 'publishedAt' | 'status' | 'uploadedBy'>, now = Date.now()): boolean {
  return item.status === 'published' && !!item.uploadedBy && !!item.publishedAt && now - new Date(item.publishedAt).getTime() < WEEK;
}

export function downloadsLabel(n: number): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? 'download' : 'downloads'}`;
}

/** 'drive.google.com' for an http(s) address; null for anything else. */
export function linkHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

/** Where a link leads, in words: 'Google Drive', 'the VLE', or its host. */
export function linkPlace(item: Pick<LibraryItem, 'url'>): string {
  const host = linkHost(item.url);
  if (!host) return 'another site';
  if (host === 'drive.google.com' || host === 'docs.google.com') return 'Google Drive';
  return host;
}

/** 'PDF, 2.4 MB' for files; 'Google Drive' for links. */
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

/** 'Past paper, 2025, Zone A'. */
export function examLabel(item: Pick<LibraryItem, 'examYear' | 'zone'>): string | null {
  if (!item.examYear && !item.zone) return null;
  return [item.examYear, item.zone ? `Zone ${item.zone}` : null].filter(Boolean).join(', ');
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
