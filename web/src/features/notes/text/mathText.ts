// Formulas written as text: $…$ in a line and $$…$$ on their own, as students paste them (from Mini Noora, a forum
// post, a cheat sheet) and as a note's plain text keeps them. Pure (mathText.test.ts).
//
// A formula in a line opens with a $ that has no space after it and closes with a $ that has none before it and no
// digit after it, so prices ("$5 to $10") stay text.

/** A formula in a line, its LaTeX in group 1 (global: every one in a text). */
export const INLINE_MATH = /(?<![\\$])\$(?=\S)([^$\n]*?\S)\$(?![\d$])/g;
/** A formula on its own line, its LaTeX in group 1 (global). */
export const BLOCK_MATH = /\$\$([^$]+?)\$\$/g;

export type MathPart = { kind: 'text'; text: string } | { kind: 'math'; tex: string; display: boolean };

/** A text cut into its words and its formulas. */
export function mathParts(text: string): MathPart[] {
  const found: { at: number; end: number; tex: string; display: boolean }[] = [];
  for (const m of text.matchAll(BLOCK_MATH)) {
    found.push({ at: m.index, end: m.index + m[0].length, tex: m[1].trim(), display: true });
  }
  for (const m of text.matchAll(INLINE_MATH)) {
    const at = m.index;
    if (found.some((f) => at < f.end && at + m[0].length > f.at)) continue;
    found.push({ at, end: at + m[0].length, tex: m[1], display: false });
  }
  found.sort((a, b) => a.at - b.at);
  const out: MathPart[] = [];
  let from = 0;
  for (const f of found) {
    if (!f.tex) continue;
    if (f.at > from) out.push({ kind: 'text', text: text.slice(from, f.at) });
    out.push({ kind: 'math', tex: f.tex, display: f.display });
    from = f.end;
  }
  if (from < text.length) out.push({ kind: 'text', text: text.slice(from) });
  return out;
}

/** `parts` cut short: they end in "…" (after a space when they end in a formula). */
function cutShort(parts: readonly MathPart[]): MathPart[] {
  const last = parts.at(-1);
  if (last?.kind === 'text' && last.text.trim()) {
    return [...parts.slice(0, -1), { kind: 'text', text: `${last.text.trimEnd()}…` }];
  }
  const kept = last?.kind === 'text' ? parts.slice(0, -1) : parts;
  return [...kept, { kind: 'text', text: kept.length ? ' …' : '…' }];
}

/**
 * A text as one line of a list (a note's start, its first line), cut to about `max` characters: formulas are kept
 * whole or left out, never cut, and count by their LaTeX. A formula on its own line that the text ends in the middle
 * of (a note's excerpt is its first characters) is left out too.
 */
export function lineParts(text: string, max: number): MathPart[] {
  const parts = mathParts(joinFormulaLines(text).replace(/\s+/g, ' ').trim());
  const out: MathPart[] = [];
  let room = max;
  for (const [i, part] of parts.entries()) {
    if (part.kind === 'math') {
      if (part.tex.length > room) return cutShort(out);
      out.push(part);
      room -= part.tex.length;
      continue;
    }
    const open = i === parts.length - 1 ? part.text.indexOf('$$') : -1;
    const words = open < 0 ? part.text : part.text.slice(0, open);
    if (words.length > room) return cutShort([...out, { kind: 'text', text: words.slice(0, Math.max(room - 1, 0)) }]);
    if (words) out.push({ kind: 'text', text: words });
    room -= words.length;
    if (open >= 0) return cutShort(out);
  }
  return out;
}

/** Parts as plain text, each formula as its LaTeX (where nothing can be set: a page's title, a dialog's). */
export const plainText = (parts: readonly MathPart[]): string =>
  parts.map((p) => (p.kind === 'text' ? p.text : p.tex)).join('');

/** Pasted text with each formula on its own lines brought onto one line ($$ … $$ across lines), so it is set as one. */
export const joinFormulaLines = (text: string): string =>
  text.replace(/\$\$([\s\S]*?)\$\$/g, (_whole, inner: string) => `$$${inner.replace(/\s*\n\s*/g, ' ').trim()}$$`);
