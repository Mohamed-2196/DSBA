// The forum's small markdown: paragraphs, **bold**, *italic*, `code`, ``` fenced blocks,
// "- " and "1. " lists, "> " quotes, [links](/internal or https://…) and images on a line of their own:
// ![what the picture shows](/demo/forum/some-image.jpg). Images can only come from the app's own /demo/
// folder (the forum is a prototype: nothing is uploaded, and nothing is fetched from other sites).
// Parsed into a tiny AST that <Prose> renders as React elements (no HTML injection).

const FENCE = /^\s*```/;
const UL = /^\s*[-*]\s+/;
const OL = /^\s*\d+[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const IMAGE = /^\s*!\[([^\]\n]*)\]\((\/demo\/[^\s)]+)\)\s*$/;

const isBlockStart = (line) => FENCE.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line) || IMAGE.test(line);

/** -> [{ type: 'p'|'ul'|'ol'|'quote'|'code'|'image', text?, items?, lang?, src?, alt? }] */
export function parseBlocks(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
      i += 1; // closing fence (or end of input)
      blocks.push({ type: 'code', lang, text: buf.join('\n') });
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const re = ordered ? OL : UL;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].replace(QUOTE, ''));
      blocks.push({ type: 'quote', text: buf.join('\n') });
      continue;
    }
    const image = IMAGE.exec(line);
    if (image) {
      blocks.push({ type: 'image', alt: image[1].trim(), src: image[2] });
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
// (formulas like R_f and β_i are common in this forum).
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\((?:\/[^\s)]*|https?:\/\/[^\s)]+)\))/g;

/** -> [{ type: 'text'|'code'|'strong'|'em'|'link', text, href? }] */
export function parseInline(text) {
  const out = [];
  const s = String(text ?? '');
  let last = 0;
  for (const match of s.matchAll(INLINE)) {
    if (match.index > last) out.push({ type: 'text', text: s.slice(last, match.index) });
    const [tok] = match;
    if (match[1]) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (match[2]) out.push({ type: 'strong', text: tok.slice(2, -2) });
    else if (match[3]) out.push({ type: 'em', text: tok.slice(1, -1) });
    else if (match[4]) {
      const close = tok.indexOf('](');
      out.push({ type: 'link', text: tok.slice(1, close), href: tok.slice(close + 2, -1) });
    }
    last = match.index + tok.length;
  }
  if (last < s.length) out.push({ type: 'text', text: s.slice(last) });
  return out;
}

/**
 * Plain text (markdown stripped), whitespace collapsed. For search; `codeAs` replaces code blocks (excerpts use '…').
 * Images leave nothing behind, unless `imageAlt` keeps their description (search finds a thread by what its picture shows).
 */
export function toPlainText(src, { codeAs = null, imageAlt = false } = {}) {
  return parseBlocks(src)
    .map((b) => {
      if (b.type === 'code') return codeAs ?? b.text;
      if (b.type === 'image') return imageAlt ? b.alt : '';
      const parts = b.items || [b.text];
      return parts.map((p) => parseInline(p).map((t) => t.text).join('')).join(' ');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** The text as user-perceived characters: an emoji, or an Arabic letter with its marks, is one unit and is never cut in half. */
function graphemes(text) {
  return SEGMENTER ? Array.from(SEGMENTER.segment(text), (s) => s.segment) : Array.from(text);
}

/** First ~`max` characters of the plain text, cut at a word boundary (and never inside an emoji or a letter's marks). */
export function excerpt(src, max = 180) {
  const plain = toPlainText(src, { codeAs: '…' }).replace(/:\s*…\s*/g, ': … ');
  const units = graphemes(plain);
  if (units.length <= max) return plain;
  const cut = units.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  // Trailing punctuation goes before the ellipsis: Latin and Arabic (، ؛ ؟) alike.
  return `${(space > cut.length * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?(–\-،؛؟]+$/, '')}…`;
}

/** The first image in a post: { src, alt } or null. Thread rows show it as a small thumbnail. */
export function firstImage(src) {
  const block = parseBlocks(src).find((b) => b.type === 'image');
  return block ? { src: block.src, alt: block.alt } : null;
}
