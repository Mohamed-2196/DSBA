// Her AI's answers as rich text: the Markdown Claude writes, parsed into plain data that RichText.tsx draws as React
// elements (so what she writes is only ever text, never HTML). Pure: no React, no network.
//   blocks   "### " headings, paragraphs, "- " and "1. " lists, "> " quotes, ``` code, | tables |, "---" rules,
//            and formulas on lines of their own: $$…$$ or \[…\]
//   inline   `code`, $…$ and \(…\) formulas, **bold**, *italic*, [links](/hub/path)
// While an answer streams in, a formula or a table that is still being written is marked `open` so it is not set
// half-finished.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'math'; tex: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; text: string; href: string };

export type Align = 'left' | 'center' | 'right' | null;

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'p'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; start: number; items: string[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'math'; tex: string; open: boolean }
  | { type: 'table'; head: string[]; align: Align[]; rows: string[][] }
  | { type: 'hr' };

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s*#{1,6}\s+/;
const UL = /^\s*[-*+]\s+/;
const OL = /^\s*(\d{1,4})[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const MATH_OPEN = /^\s*(\$\$|\\\[)/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const LANG = /^[A-Za-z0-9+#.-]{1,20}$/;

const isRow = (line: string | undefined): line is string => line !== undefined && line.includes('|');

/** A table row's cells: split at each | that is not escaped, without the outer pipes. */
export function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim().replaceAll('\\|', '|'));
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return left ? 'left' : null;
}

const startsBlock = (line: string, next: string | undefined): boolean =>
  FENCE.test(line) || HEADING.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line) || HR.test(line) || MATH_OPEN.test(line) || (isRow(line) && next !== undefined && TABLE_RULE.test(next));

/** A formula on lines of its own, from the line at `i`: the formula and the line after it. */
function mathBlock(lines: string[], i: number): { block: Block; next: number } {
  const first = lines[i].trim();
  const close = first.startsWith('$$') ? '$$' : '\\]';
  const rest = first.slice(2);
  if (rest.trimEnd().endsWith(close) && rest.trim().length >= close.length) {
    return { block: { type: 'math', tex: rest.trimEnd().slice(0, -close.length).trim(), open: false }, next: i + 1 };
  }
  const buf = [rest];
  let j = i + 1;
  while (j < lines.length) {
    const line = lines[j++];
    if (line.trimEnd().endsWith(close)) {
      buf.push(line.trimEnd().slice(0, -close.length));
      return { block: { type: 'math', tex: buf.join('\n').trim(), open: false }, next: j };
    }
    buf.push(line);
  }
  return { block: { type: 'math', tex: buf.join('\n').trim(), open: true }, next: j };
}

export function parseRich(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const fence = line.trim().slice(0, 3);
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) buf.push(lines[i++]);
      i += 1; // the closing fence (or the end of the answer so far)
      blocks.push({ type: 'code', lang: LANG.test(lang) ? lang : '', text: buf.join('\n') });
      continue;
    }
    if (MATH_OPEN.test(line)) {
      const { block, next } = mathBlock(lines, i);
      if (block.type === 'math' && (block.tex || block.open)) blocks.push(block);
      i = next;
      continue;
    }
    if (HEADING.test(line)) {
      blocks.push({ type: 'heading', text: line.replace(HEADING, '').replace(/\s#+\s*$/, '').trim() });
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (isRow(line) && lines[i + 1] !== undefined && TABLE_RULE.test(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map(alignOf);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isRow(lines[i]) && lines[i].trim()) {
        const row = cells(lines[i++]);
        rows.push(head.map((_, c) => row[c] ?? ''));
      }
      blocks.push({ type: 'table', head, align: head.map((_, c) => align[c] ?? null), rows });
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const marker = ordered ? OL : UL;
      const start = ordered ? Number(OL.exec(line)?.[1] ?? 1) : 1;
      const items: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (marker.test(cur)) {
          items.push(cur.replace(marker, ''));
        } else if (cur.trim() && /^\s{2,}/.test(cur) && items.length) {
          // a line that carries on the item above, or a list inside it (drawn as part of the item)
          items[items.length - 1] += `\n${cur.trim().replace(UL, '– ').replace(OL, (m) => m.trim() + ' ')}`;
        } else {
          break;
        }
        i += 1;
      }
      blocks.push(ordered ? { type: 'ol', start, items } : { type: 'ul', items });
      continue;
    }
    if (QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].replace(QUOTE, ''));
      blocks.push({ type: 'quote', text: buf.join('\n') });
      continue;
    }
    const buf = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) buf.push(lines[i++]);
    blocks.push({ type: 'p', text: buf.join('\n') });
  }
  return blocks;
}

// In priority order: code, a formula ($$…$$, \(…\), $…$), bold, italic, a link. Underscores are never italic
// (R_f and x_i are common). A $…$ formula has no space just inside either $ and no digit after the closing one, so
// "$5 or $10" stays text.
const INLINE =
  /(`[^`\n]+`)|(\$\$[^$\n]+?\$\$)|(\\\([^\n]+?\\\))|(\$(?=\S)[^$\n]*?[^\s\\]\$(?!\d)|\$[^\s$]\$(?!\d))|(\*\*(?=\S)[^\n]+?\*\*)|(\*(?=[^*\s])[^*\n]*?[^*\s]\*|\*[^*\s]\*)|(\[[^\]\n]{1,200}\]\([^\s)]{1,300}\))/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index;
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) });
    const [tok] = match;
    if (match[1]) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (match[2]) out.push({ type: 'math', tex: tok.slice(2, -2).trim() });
    else if (match[3]) out.push({ type: 'math', tex: tok.slice(2, -2).trim() });
    else if (match[4]) out.push({ type: 'math', tex: tok.slice(1, -1) });
    else if (match[5]) out.push({ type: 'strong', children: parseInline(tok.slice(2, -2)) });
    else if (match[6]) out.push({ type: 'em', children: parseInline(tok.slice(1, -1)) });
    else {
      const close = tok.indexOf('](');
      out.push({ type: 'link', text: tok.slice(1, close), href: tok.slice(close + 2, -1) });
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

const LINK = /\[([^\]\n]{1,200})\]\(([^\s)]{1,300})\)/g;

/** The answer as plain words, for the clipboard's first line and a screen reader: links as their words, no marks. */
export function plainText(src: string): string {
  return src
    .replace(LINK, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
