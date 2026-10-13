// Text helpers for The DSBA Newsletter: the tiny inline markup used in the issue copy, plain-text extraction
// (read time), names and addresses. Pure functions, no React. Dates live in src/lib/dates.ts.
//
// Inline markup (one level, no nesting):
//   **bold**   *italic*   ==highlighter mark==   [label](/internal/route)   [label](https://external)
import type { IssueSection } from '../../../api/types';
import type { Aside, Block } from '../types';

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

/** Every human-readable string in a block (for the read time). */
function blockStrings(b: Block): string[] {
  switch (b.type) {
    case 'p':
    case 'signoff':
      return [b.text];
    case 'list':
      return b.items;
    case 'cta':
      return [];
  }
}

function asideStrings(a: Aside | null | undefined): string[] {
  if (!a) return [];
  switch (a.type) {
    case 'card':
      return [a.kicker, a.title, a.text];
    case 'stats':
      return [a.title, ...a.items.map((i) => `${i.value} ${i.label}`), a.foot ?? ''];
  }
}

/** What a section is called beside its icon: its label, or its title when it has none. */
export const sectionLabel = (s: Pick<IssueSection, 'label' | 'title'>): string => s.label?.trim() || s.title;

/** Plain text of one section (editorial copy only; live data from other features is not counted). */
export function sectionText(section: IssueSection): string {
  const parts: string[] = [section.label ?? '', section.title];
  if (section.figure?.caption) parts.push(section.figure.caption);
  for (const b of section.blocks) parts.push(...blockStrings(b));
  for (const b of section.after) parts.push(...blockStrings(b));
  parts.push(...asideStrings(section.aside));
  return parts.filter(Boolean).map(plainText).join(' ');
}

/** Estimated reading time in whole minutes (230 words a minute; live sections add their own estimate). */
export function readMinutes(issue: { title: string; dek?: string; sections: readonly IssueSection[] }): number {
  if (!issue.sections.length) return 1;
  let words = countWords(`${issue.title} ${issue.dek ?? ''}`);
  for (const s of issue.sections) words += countWords(sectionText(s)) + (s.estWords ?? 0);
  return Math.max(1, Math.round(words / 230));
}

/** 0 → '00', 1 → '01'. */
export const issueNo = (n: number): string => String(n).padStart(2, '0');

/** 'Hawra T., Zainab K. and Hussain M.' */
export function listNames(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** A URL slug from a title: 'Launch edition!' → 'launch-edition'. At most `max` characters. */
export function slugify(title: string, max = 80): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/** The element id of a section in the reader (the ?section= deep link scrolls to it). */
export const sectionDomId = (id: string): string => `nl-sec-${id}`;

/** The toast after publishing. The API emails the cohort at most once a day (`emailed` false: told in the Hub only). */
export function publishedNote(no: string, emailed: boolean): { title: string; body: string } {
  return {
    title: `Issue ${no} is out`,
    body: emailed
      ? 'It’s on the newsletter page, and everyone who wants newsletter notifications has been told.'
      : 'Published. The cohort email goes out once a day; the next one can be sent tomorrow.',
  };
}
