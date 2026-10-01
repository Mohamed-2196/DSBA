// Display strings for files (sentence case, no joined meta strings).
import { timeAgo } from '../../../ui';
import { formatSize, pageNoun } from './kinds.js';

export const pagesLabel = (f) => `${f.pages} ${pageNoun(f.format, f.pages)}`;
export const addedLabel = (f, now = Date.now()) => `Added ${timeAgo(f.addedAt, now)}`;
export const downloadsLabel = (f) => `${f.downloads.toLocaleString('en-GB')} ${f.downloads === 1 ? 'download' : 'downloads'}`;
export const sizeLabel = (f) => formatSize(f.sizeKB);

/** Short module tag: the unit code, or the short name for Year 3 modules (no code in v1). */
export const moduleTag = (f) => f.moduleCode || f.moduleShort;

/** True when the title already names the module (so cards needn't repeat it). */
export const titleHasModule = (f) => Boolean(f.moduleCode ? f.title.startsWith(f.moduleCode) : f.title.startsWith(f.moduleName));

/** The one line of meta under a card, chosen to match the sort. */
export function cardMeta(f, sort) {
  if (sort === 'downloads') return downloadsLabel(f);
  if (sort === 'az') return `${f.kindLabel}, ${pagesLabel(f)}`;
  return addedLabel(f);
}
