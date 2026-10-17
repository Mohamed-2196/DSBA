// Moving a picture or a file to another place in the text: where it would land for a point on screen, and the
// change that moves it. Pure functions over the document and the blocks' boxes (blocks.test.ts).
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

/** A block of the text (a paragraph, a list, a picture …) and where it is on screen, in pixels. */
export interface BlockBox {
  pos: number;
  size: number;
  top: number;
  bottom: number;
}

/** Where a block dropped at height `y` lands: before or after the nearest block, or below the end of the text with
 *  `lines` empty lines before it. `at` is the height of the place, for the line that shows it. */
export interface Drop {
  pos: number;
  lines: number;
  at: number;
}

export function dropTarget(blocks: readonly BlockBox[], y: number, linePx: number): Drop {
  if (!blocks.length) return { pos: 0, lines: 0, at: y };
  for (const b of blocks) {
    if (y < b.bottom) return y < (b.top + b.bottom) / 2 ? { pos: b.pos, lines: 0, at: b.top } : { pos: b.pos + b.size, lines: 0, at: b.bottom };
  }
  const last = blocks[blocks.length - 1];
  const lines = linePx > 0 ? Math.min(400, Math.max(0, Math.floor((y - last.bottom) / linePx))) : 0;
  return { pos: last.pos + last.size, lines, at: last.bottom + lines * linePx };
}

/** Whether dropping a block at `drop` would leave it where it is. */
export const staysPut = (from: number, size: number, drop: Drop): boolean => drop.lines === 0 && (drop.pos === from || drop.pos === from + size);

/** The change that moves the block at `from` to `drop` (with `attrs` changed on the way), and selects it there. */
export function moveBlock(state: EditorState, from: number, drop: Drop, attrs?: Record<string, unknown>): Transaction | null {
  const node = state.doc.nodeAt(from);
  if (!node) return null;
  const moved = attrs ? node.type.create({ ...node.attrs, ...attrs }, node.content, node.marks) : node;
  const paragraph = state.schema.nodes.paragraph;
  const filler = paragraph ? Array.from({ length: drop.lines }, () => paragraph.create()) : [];
  const fillerSize = filler.reduce((n, p) => n + p.nodeSize, 0);
  const tr = state.tr;
  let at: number;
  if (drop.pos >= from + node.nodeSize) {
    tr.insert(drop.pos, [...filler, moved]);
    tr.delete(from, from + node.nodeSize);
    at = drop.pos + fillerSize - node.nodeSize;
  } else if (drop.pos <= from) {
    tr.delete(from, from + node.nodeSize);
    tr.insert(drop.pos, [...filler, moved]);
    at = drop.pos + fillerSize;
  } else return null;
  tr.setSelection(NodeSelection.create(tr.doc, at));
  return tr.scrollIntoView();
}

/** The text's top-level blocks and their boxes on screen. */
export function blockBoxes(state: EditorState, domAt: (pos: number) => Node | null): BlockBox[] {
  const out: BlockBox[] = [];
  state.doc.forEach((node, offset) => {
    const dom = domAt(offset);
    if (!(dom instanceof HTMLElement)) return;
    const r = dom.getBoundingClientRect();
    out.push({ pos: offset, size: node.nodeSize, top: r.top, bottom: r.bottom });
  });
  return out;
}
