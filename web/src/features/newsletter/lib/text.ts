// Text helpers for The DSBA Newsletter: the tiny inline markup used in the issue copy, plain-text
// extraction (read time), snippets and date maths. Pure functions, no React.
//
// Inline markup (one level, no nesting):
//   **bold**   *italic*   ==highlighter mark==   [label](/internal/route)   [label](https://external)
import type { Aside, Block, Section } from '../types';

/** Splits a string into plain runs and markup tokens (String.split keeps the captured tokens). */
export const INLINE_RE = /(\*\*[^*]+\*\*|==[^=]+==|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g;
export const LINK_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/** Markup → plain text. */
export function plainText(markup = ''): string {
  return String(markup)
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/\*([^*\s][^*]*)\*/g, '$1');
}

export function countWords(text = ''): number {
  const m = String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu);
  return m ? m.length : 0;
}

/** Every human-readable string in a block (for read time). */
function blockStrings(b: Block): string[] {
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
    case 'figure':
      return b.caption ? [b.caption] : [];
    case 'cta':
      return [];
  }
}

function asideStrings(a: Aside | undefined): string[] {
  if (!a) return [];
  switch (a.type) {
    case 'note':
      return [a.title, a.text];
    case 'card':
      return [a.kicker, a.title, a.text];
    case 'quote':
      return [a.text, a.cite ?? ''];
    case 'stats':
      return [a.title, ...a.items.map((i) => `${i.value} ${i.label}`), a.foot ?? ''];
  }
}

/** Plain text of one section (editorial copy only; live data from other features is not counted). */
export function sectionText(section: Section): string {
  const parts: string[] = [section.label, section.title];
  if (section.figure?.caption) parts.push(section.figure.caption);
  for (const b of section.blocks) parts.push(...blockStrings(b));
  for (const c of section.cohorts ?? []) parts.push(c.title, ...c.paragraphs);
  if (section.chart) parts.push(section.chart.caption, ...section.chart.notes.map((n) => n.text));
  for (const b of section.after ?? []) parts.push(...blockStrings(b));
  parts.push(...asideStrings(section.aside));
  return parts.filter(Boolean).map(plainText).join(' ');
}

/** Estimated reading time in whole minutes (230 wpm; live sections add their own estimate). */
export function readMinutes(issue: { title: string; dek?: string; sections: Section[] }): number {
  if (!issue.sections.length) return 1;
  let words = countWords(`${issue.title} ${issue.dek ?? ''}`);
  for (const s of issue.sections) words += countWords(sectionText(s)) + (s.estWords ?? 0);
  return Math.max(1, Math.round(words / 230));
}

// ── Dates (issue dates are calendar days: 'YYYY-MM-DD', read as local midnight) ──

export function parseDay(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from a to b (both local days). */
export function daysBetween(a: Date | string, b: Date | string): number {
  const da = a instanceof Date ? a : parseDay(a);
  const db = b instanceof Date ? b : parseDay(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function longDate(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Short month names by hand, as the calendar writes them: no locale turns September into 'Sept'.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (d: Date): string => MONTHS_SHORT[d.getMonth()] ?? '';

/** '29 Sep 2026'. */
export function shortDate(iso: string): string {
  const d = parseDay(iso);
  return `${d.getDate()} ${monthShort(d)} ${d.getFullYear()}`;
}

/** 'YYYY-MM-DD' for a local date. */
export function isoDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 0 → '00', 1 → '01'. */
export const issueNo = (n: number): string => String(n).padStart(2, '0');

/** 'in 13 days' / 'tomorrow' / 'today' / '3 days ago'. */
export function countdownLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** 'Hawra T., Zainab K. and Hussain M.' */
export function listNames(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A URL slug from a title: 'Launch edition!' → 'launch-edition'. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** 'YYYY-MM-DD' n days after another. */
export function addDaysIso(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** The element id of a section in the reader (the ?section= deep link scrolls to it). */
export const sectionDomId = (id: string): string => `nl-sec-${id}`;
