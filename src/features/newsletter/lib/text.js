// Text helpers for The Pulse: the tiny inline markup used in the issue copy, plain-text
// extraction (read time, search), snippets and date maths. Pure functions, no React.
//
// Inline markup (one level, no nesting):
//   **bold**   *italic*   ==highlighter mark==   [label](/internal/route)   [label](https://external)

/** Splits a string into plain runs and markup tokens (String.split keeps the captured tokens). */
export const INLINE_RE = /(\*\*[^*]+\*\*|==[^=]+==|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g;
export const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/** Markup → plain text. */
export function plainText(markup = '') {
  return String(markup)
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1');
}

export function countWords(text = '') {
  const m = String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu);
  return m ? m.length : 0;
}

/** Every human-readable string in a block (for read time and search). */
function blockStrings(b) {
  switch (b.type) {
    case 'p':
    case 'signoff':
      return [b.text];
    case 'list':
      return b.items;
    case 'steps':
      return b.items.flatMap((s) => [s.title, s.text]);
    case 'qa':
      return b.items.flatMap((x) => [x.q, x.a]);
    case 'cta':
      return [];
    default:
      return [];
  }
}

function asideStrings(a) {
  if (!a) return [];
  if (a.type === 'note') return [a.title, a.text];
  if (a.type === 'quote') return [a.text, a.cite];
  if (a.type === 'stats') return [a.title, ...a.items.map((i) => `${i.value} ${i.label}`), a.foot];
  return [a.title];
}

/** Plain text of one section (editorial copy only; live data from other features is not indexed). */
export function sectionText(section) {
  const parts = [section.label, section.title];
  for (const b of section.blocks || []) parts.push(...blockStrings(b));
  for (const c of section.cohorts || []) parts.push(c.title, ...(c.paragraphs || []));
  if (section.chart) parts.push(section.chart.caption, ...section.chart.notes.map((n) => n.text));
  for (const b of section.after || []) parts.push(...blockStrings(b));
  parts.push(...asideStrings(section.aside));
  return parts.filter(Boolean).map(plainText).join(' ');
}

/** Estimated reading time in whole minutes (230 wpm; live sections add their own estimate). */
export function readMinutes(issue) {
  if (!issue?.sections?.length) return 1;
  let words = countWords(`${issue.title} ${issue.dek || ''}`);
  for (const s of issue.sections) words += countWords(sectionText(s)) + (s.estWords || 0);
  return Math.max(1, Math.round(words / 230));
}

/** A ~140-character excerpt around the first match of `term`, trimmed to word boundaries. */
export function snippetAround(text, term, radius = 70) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  const i = term ? t.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return t.length > radius * 2 ? `${t.slice(0, radius * 2).replace(/\s+\S*$/, '')}…` : t;
  let start = Math.max(0, i - radius);
  let end = Math.min(t.length, i + term.length + radius);
  if (start > 0) start = t.indexOf(' ', start) + 1 || start;
  if (end < t.length) end = t.lastIndexOf(' ', end) > i ? t.lastIndexOf(' ', end) : end;
  const body = t.slice(start, end).trim();
  const tail = end < t.length && !/[.!?]$/.test(body) ? '…' : '';
  return `${start > 0 ? '…' : ''}${body}${tail}`;
}

// ── Dates (issue dates are calendar days: 'YYYY-MM-DD', read as local midnight) ──

export function parseDay(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from a to b (both local days). */
export function daysBetween(a, b) {
  const da = a instanceof Date ? a : parseDay(a);
  const db = b instanceof Date ? b : parseDay(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function longDate(iso) {
  return parseDay(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortDate(iso) {
  return parseDay(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 0 → '00', 1 → '01'. */
export const issueNo = (n) => String(n).padStart(2, '0');

/** 'in 13 days' / 'tomorrow' / 'today' / '3 days ago'. */
export function countdownLabel(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
