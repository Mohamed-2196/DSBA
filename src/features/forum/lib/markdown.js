// The forum's small markdown: paragraphs, **bold**, *italic*, `code`, ``` fenced blocks,
// "- " and "1. " lists, "> " quotes and [links](/internal or https://…).
// Parsed into a tiny AST that <Prose> renders as React elements (no HTML injection).

const FENCE = /^\s*```/;
const UL = /^\s*[-*]\s+/;
const OL = /^\s*\d+[.)]\s+/;
const QUOTE = /^\s*>\s?/;

const isBlockStart = (line) => FENCE.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line);

/** -> [{ type: 'p'|'ul'|'ol'|'quote'|'code', text?, items?, lang? }] */
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

/** Plain text (markdown stripped), whitespace collapsed. For search; `codeAs` replaces code blocks (excerpts use '…'). */
export function toPlainText(src, { codeAs = null } = {}) {
  return parseBlocks(src)
    .map((b) => {
      if (b.type === 'code') return codeAs ?? b.text;
      const parts = b.items || [b.text];
      return parts.map((p) => parseInline(p).map((t) => t.text).join('')).join(' ');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First ~`max` characters of the plain text, cut at a word boundary. */
export function excerpt(src, max = 180) {
  const plain = toPlainText(src, { codeAs: '…' }).replace(/:\s*…\s*/g, ': … ');
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[\s,.;:!?(–-]+$/, '')}…`;
}
