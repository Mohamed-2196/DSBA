// Pure text transforms for the composer toolbar. Each takes (text, selStart, selEnd) and returns
// { text, sel: [start, end] }: the new value and the selection to restore.

export interface Edit {
  text: string;
  sel: [number, number];
}

export type EditFn = (text: string, start: number, end: number) => Edit;

function wrap(text: string, s: number, e: number, before: string, after: string, placeholder: string): Edit {
  const selected = text.slice(s, e);
  // Toggle off when the selection is already wrapped.
  if (selected && text.slice(s - before.length, s) === before && text.slice(e, e + after.length) === after) {
    return { text: text.slice(0, s - before.length) + selected + text.slice(e + after.length), sel: [s - before.length, e - before.length] };
  }
  const inner = selected || placeholder;
  const next = text.slice(0, s) + before + inner + after + text.slice(e);
  return { text: next, sel: [s + before.length, s + before.length + inner.length] };
}

export const bold: EditFn = (t, s, e) => wrap(t, s, e, '**', '**', 'bold text');
export const italic: EditFn = (t, s, e) => wrap(t, s, e, '*', '*', 'italic text');

export const code: EditFn = (t, s, e) => {
  const selected = t.slice(s, e);
  if (selected.includes('\n')) {
    const before = s > 0 && t[s - 1] !== '\n' ? '\n```\n' : '```\n';
    return wrap(t, s, e, before, '\n```\n', 'code');
  }
  return wrap(t, s, e, '`', '`', 'formula or code');
};

function prefixLines(t: string, s: number, e: number, prefixFor: (i: number) => string): Edit {
  const start = t.lastIndexOf('\n', s - 1) + 1;
  let end = t.indexOf('\n', e);
  if (end === -1) end = t.length;
  const lines = t.slice(start, end).split('\n');
  const out = lines.map((line, i) => prefixFor(i) + line).join('\n');
  const next = t.slice(0, start) + out + t.slice(end);
  return s === e ? { text: next, sel: [start + out.length, start + out.length] } : { text: next, sel: [start, start + out.length] };
}

export const bulletList: EditFn = (t, s, e) => prefixLines(t, s, e, () => '- ');
export const numberedList: EditFn = (t, s, e) => prefixLines(t, s, e, (i) => `${i + 1}. `);
export const quote: EditFn = (t, s, e) => prefixLines(t, s, e, () => '> ');

export const link: EditFn = (t, s, e) => {
  const label = t.slice(s, e) || 'link text';
  const url = 'https://';
  const inserted = `[${label}](${url})`;
  const urlStart = s + label.length + 3;
  return { text: t.slice(0, s) + inserted + t.slice(e), sel: [urlStart, urlStart + url.length] };
};

/**
 * Put `block` (a picture line) on lines of its own at the cursor: after the line the cursor is on, with a blank line
 * around it so it never runs into a paragraph. The cursor ends up after it.
 */
export function insertBlock(t: string, at: number, block: string): Edit {
  const pos = Math.max(0, Math.min(at, t.length));
  // Insert at the end of the current line, never in the middle of a word.
  const lineEnd = t.indexOf('\n', pos);
  const cut = lineEnd === -1 ? t.length : lineEnd;
  const head = t.slice(0, cut).replace(/\s+$/, '');
  const tail = t.slice(cut).replace(/^\s+/, '');
  const before = head ? `${head}\n\n` : '';
  const after = tail ? `\n\n${tail}` : '\n';
  const text = before + block + after;
  const caret = before.length + block.length + 1;
  return { text, sel: [caret, caret] };
}

/** The text without every line that is exactly this picture (removing an attached image). */
export function removeImageLines(t: string, mediaUrl: string): string {
  const lines = t.split('\n');
  const kept = lines.filter((line) => {
    const m = /^\s*!\[[^\]\n]*\]\(([^\s)]+)\)\s*$/.exec(line);
    return !(m && m[1] === mediaUrl);
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

/** A picture's markdown line. The description must not break out of the brackets. */
export function imageMarkdown(alt: string, mediaUrl: string): string {
  const clean = alt.replace(/[[\]()\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  return `![${clean || 'Image'}](${mediaUrl})`;
}

/** 'Week 3_notes-final.png' -> 'Week 3 notes final' (a starting point for the picture's description). */
export function altFromFileName(name: string): string {
  const stem = name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return stem.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Image';
}
