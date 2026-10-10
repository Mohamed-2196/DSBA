// The forum's small markdown. The API stores it raw; this file parses it and <Prose> renders the result.
//   paragraphs, **bold**, *italic*, `code`, ``` fenced blocks, "- " and "1. " lists, "> " quotes,
//   [links](/inside/the/app | https://… | mailto:…) and a picture on a line of its own: ![what it shows](/api/v1/media/<id>)
// Parsing yields a tiny AST of plain strings. <Prose> turns it into React elements, so user text is only ever a React
// child (escaped by React) and never HTML. Link targets and picture sources are checked by lib/links.ts: anything
// that is not allowed stays plain text.
import { isMediaPath } from './links';

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'p'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'image'; alt: string; src: string };

const FENCE = /^\s*```/;
const UL = /^\s*[-*]\s+/;
const OL = /^\s*\d+[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const IMAGE = /^\s*!\[([^\]\n]*)\]\(([^\s)]+)\)\s*$/;
// A fence's language is only ever a short label ('r', 'python', 'c++').
const LANG = /^[A-Za-z0-9+#.-]{1,20}$/;

/** The picture on this line, when the line is nothing but a picture from the API. */
function imageLine(line: string): { alt: string; src: string } | null {
  const m = IMAGE.exec(line);
  if (!m || !isMediaPath(m[2])) return null;
  return { alt: m[1].trim(), src: m[2] };
}

const isBlockStart = (line: string) => FENCE.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line) || imageLine(line) !== null;

export function parseBlocks(src: string | null | undefined): Block[] {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
      i += 1; // the closing fence (or the end of the text)
      blocks.push({ type: 'code', lang: LANG.test(lang) ? lang : '', text: buf.join('\n') });
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const re = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      blocks.push(ordered ? { type: 'ol', items } : { type: 'ul', items });
      continue;
    }
    if (QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].replace(QUOTE, ''));
      blocks.push({ type: 'quote', text: buf.join('\n') });
      continue;
    }
    const image = imageLine(line);
    if (image) {
      blocks.push({ type: 'image', ...image });
      i += 1;
      continue;
    }
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    blocks.push({ type: 'p', text: buf.join('\n') });
  }
  return blocks;
}

// Inline tokens, in priority order: code, bold, italic, link. Underscores are NOT italic
// (formulas like R_f and β_i are common in this forum). A link's target is checked when it is rendered.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\([^\s)]+\))/g;

export function parseInline(text: string | null | undefined): InlineToken[] {
  const out: InlineToken[] = [];
  const s = String(text ?? '');
  let last = 0;
  for (const match of s.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', text: s.slice(last, at) });
    const [tok] = match;
    if (match[1]) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (match[2]) out.push({ type: 'strong', text: tok.slice(2, -2) });
    else if (match[3]) out.push({ type: 'em', text: tok.slice(1, -1) });
    else if (match[4]) {
      const close = tok.indexOf('](');
      out.push({ type: 'link', text: tok.slice(1, close), href: tok.slice(close + 2, -1) });
    }
    last = at + tok.length;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out;
}
