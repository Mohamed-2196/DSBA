// Queries over the public issues (data/issues.js). The hidden special edition is never part of
// these: it is not in ISSUES, so it can't leak into the archive, search, prev/next or "latest".
import { ISSUES } from '../data/issues.js';
import { plainText, readMinutes, sectionText, snippetAround } from './text.js';

const withMeta = (issue) => ({ ...issue, readMinutes: issue.status === 'published' ? readMinutes(issue) : null });
const ALL = ISSUES.map(withMeta);

/** Published issues, newest first. */
export const PUBLISHED = ALL.filter((i) => i.status === 'published').sort((a, b) => b.number - a.number);

/** Every public issue (published + upcoming), newest first: the archive order. */
export const ARCHIVE = [...ALL].sort((a, b) => b.number - a.number);

/** The issue for a slug (public issues only), or null. */
export function getIssue(slug) {
  return ALL.find((i) => i.slug === slug) || null;
}

export function getLatest() {
  return PUBLISHED[0] || null;
}

/** The next issue still to come (status 'upcoming'), or null. */
export function getUpcoming() {
  return ALL.filter((i) => i.status === 'upcoming').sort((a, b) => a.number - b.number)[0] || null;
}

/** { prev, next } around an issue by number. `next` may be an upcoming (locked) issue. */
export function getNeighbours(issue) {
  const sorted = [...ALL].sort((a, b) => a.number - b.number);
  const i = sorted.findIndex((x) => x.slug === issue.slug);
  return { prev: i > 0 ? sorted[i - 1] : null, next: i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null };
}

// ── Search ────────────────────────────────────────────────────────────────
// One plain-text document per published issue: title + dek + summary + every section.
const INDEX = PUBLISHED.map((issue) => {
  const sections = issue.sections.map((s) => ({ id: s.id, text: sectionText(s) }));
  const head = plainText(`${issue.title}. ${issue.dek} ${issue.summary}`);
  return { issue, head, sections, all: `${head} ${sections.map((s) => s.text).join(' ')}`.toLowerCase() };
});

/**
 * Full-text search over published issues. Every word of the query must appear somewhere in the issue.
 * -> [{ slug, title, number, snippet }] (newest first; snippet shows the first match in context)
 */
export function searchIssueIndex(query) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const doc of INDEX) {
    if (!terms.every((t) => doc.all.includes(t))) continue;
    const phrase = terms.join(' ');
    const first = terms[0];
    const pick = (t) => (doc.head.toLowerCase().includes(t) ? doc.head : doc.sections.find((s) => s.text.toLowerCase().includes(t))?.text);
    const source = pick(phrase) || pick(first) || doc.head;
    const term = source.toLowerCase().includes(phrase) ? phrase : first;
    out.push({ slug: doc.issue.slug, title: doc.issue.title, number: doc.issue.number, snippet: snippetAround(source, term) });
  }
  return out;
}
