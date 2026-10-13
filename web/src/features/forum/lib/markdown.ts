// The forum's small markdown. The API stores it raw; this file parses it and <Prose> renders the result.
//   paragraphs, **bold**, *italic*, `code`, ``` fenced blocks, "- " and "1. " lists, "> " quotes,
//   [links](/inside/the/app | https://… | mailto:…), a picture on a line of its own: ![what it shows](/api/v1/media/<id>),
//   and formulas in LaTeX: $…$ in a sentence, $$…$$ on lines of their own (set by KaTeX: ui/TeX.tsx)
// Parsing yields a tiny AST of plain strings. <Prose> turns it into React elements, so user text is only ever a React
// child (escaped by React) and never HTML. Link targets are checked when they are rendered (lib/links.ts safeLink) and
// picture sources here (isMediaPath): anything that is not allowed stays plain text.
import { isMediaPath } from '../../../ui/safeHref';

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'math'; tex: string };

export type Block =
  | { type: 'p'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'image'; alt: string; src: string }
  | { type: 'math'; tex: string };

const FENCE = /^\s*```/;
const UL = /^\s*[-*]\s+/;
const OL = /^\s*\d+[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const MATH = /^\s*\$\$/;
const IMAGE = /^\s*!\[([^\]\n]*)\]\(([^\s)]+)\)\s*$/;
// A fence's language is only ever a short label ('r', 'python', 'c++').
const LANG = /^[A-Za-z0-9+#.-]{1,20}$/;

/** The picture on this line, when the line is nothing but a picture from the API. */
function imageLine(line: string): { alt: string; src: string } | null {
  const m = IMAGE.exec(line);
  if (!m || !isMediaPath(m[2])) return null;
  return { alt: m[1].trim(), src: m[2] };
}

const isBlockStart = (line: string) => MATH.test(line) || FENCE.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line) || imageLine(line) !== null;

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
    if (MATH.test(line)) {
      // $$ … $$ on one line, or from a line starting $$ to the line that ends with $$ (or the end of the text).
      let tex = line.trim().slice(2);
      i += 1;
      if (tex.trimEnd().endsWith('$$') && tex.trim().length >= 2) {
        tex = tex.trimEnd().slice(0, -2);
      } else {
        const buf = [tex];
        while (i < lines.length) {
          const next = lines[i++];
          if (next.trimEnd().endsWith('$$')) {
            buf.push(next.trimEnd().slice(0, -2));
            break;
          }
          buf.push(next);
        }
        tex = buf.join('\n');
      }
      if (tex.trim()) blocks.push({ type: 'math', tex: tex.trim() });
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

// Inline tokens, in priority order: code, a formula, bold, italic, link. Underscores are NOT italic
// (formulas like R_f and β_i are common in this forum). A link's target is checked when it is rendered.
// A formula is $…$ with no space just inside either $ and no digit right after the closing one, so prices such as
// "$5 or $10" stay text.
const INLINE = /(`[^`\n]+`)|(\$(?=\S)[^$\n]*?\S\$(?!\d)|\$[^\s$]\$(?!\d))|(\*\*[^*\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\([^\s)]+\))/g;

export function parseInline(text: string | null | undefined): InlineToken[] {
  const out: InlineToken[] = [];
  const s = String(text ?? '');
  let last = 0;
  for (const match of s.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', text: s.slice(last, at) });
    const [tok] = match;
    if (match[1]) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (match[2]) out.push({ type: 'math', tex: tok.slice(1, -1) });
    else if (match[3]) out.push({ type: 'strong', text: tok.slice(2, -2) });
    else if (match[4]) out.push({ type: 'em', text: tok.slice(1, -1) });
    else if (match[5]) {
      const close = tok.indexOf('](');
      out.push({ type: 'link', text: tok.slice(1, close), href: tok.slice(close + 2, -1) });
    }
    last = at + tok.length;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out;
}
