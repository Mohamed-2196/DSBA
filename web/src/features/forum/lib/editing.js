// Pure text transforms for the composer toolbar. Each takes (text, selStart, selEnd) and returns
// { text, sel: [start, end] } — the new value and the selection to restore.

function wrap(text, s, e, before, after, placeholder) {
  const selected = text.slice(s, e);
  // Toggle off when the selection is already wrapped.
  if (selected && text.slice(s - before.length, s) === before && text.slice(e, e + after.length) === after) {
    return { text: text.slice(0, s - before.length) + selected + text.slice(e + after.length), sel: [s - before.length, e - before.length] };
  }
  const inner = selected || placeholder;
  const next = text.slice(0, s) + before + inner + after + text.slice(e);
  return { text: next, sel: [s + before.length, s + before.length + inner.length] };
}

export const bold = (t, s, e) => wrap(t, s, e, '**', '**', 'bold text');
export const italic = (t, s, e) => wrap(t, s, e, '*', '*', 'italic text');

export function code(t, s, e) {
  const selected = t.slice(s, e);
  if (selected.includes('\n')) {
    const before = s > 0 && t[s - 1] !== '\n' ? '\n```\n' : '```\n';
    return wrap(t, s, e, before, '\n```\n', 'code');
  }
  return wrap(t, s, e, '`', '`', 'formula or code');
}

function prefixLines(t, s, e, prefixFor) {
  const start = t.lastIndexOf('\n', s - 1) + 1;
  let end = t.indexOf('\n', e);
  if (end === -1) end = t.length;
  const lines = t.slice(start, end).split('\n');
  const out = lines.map((line, i) => prefixFor(i) + line).join('\n');
  const next = t.slice(0, start) + out + t.slice(end);
  return s === e ? { text: next, sel: [start + out.length, start + out.length] } : { text: next, sel: [start, start + out.length] };
}

export const bulletList = (t, s, e) => prefixLines(t, s, e, () => '- ');
export const numberedList = (t, s, e) => prefixLines(t, s, e, (i) => `${i + 1}. `);
export const quote = (t, s, e) => prefixLines(t, s, e, () => '> ');

export function link(t, s, e) {
  const label = t.slice(s, e) || 'link text';
  const url = 'https://';
  const inserted = `[${label}](${url})`;
  const urlStart = s + label.length + 3;
  return { text: t.slice(0, s) + inserted + t.slice(e), sel: [urlStart, urlStart + url.length] };
}
