// Every block of the typed text that sits on a line of its own (a paragraph, a heading, a formula, a picture, a file …)
// has an id of its own (`blockId`), so handwriting can go with the block it was written beside (surface/anchors.ts).
// A new block gets one as it is made, and a copy pasted in gets a new one. A block split in two (Enter) keeps its id
// on the part with its words: Enter at the start of a line adds an empty line above it, and the words, with the
// handwriting beside them, move down; Enter at the end adds one below.
import { Extension } from '@tiptap/core';
import { Fragment, Slice, type Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';

/** The blocks that have an id: the ones a line of text, a picture or a file sits in. */
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'codeBlock',
  'blockMath',
  'image',
  'attachment',
  'horizontalRule',
] as const;

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 10;

/** A new block id (the server takes [A-Za-z0-9_-], up to 32). */
export function newBlockId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) id += ID_CHARS[Math.floor(random() * ID_CHARS.length)];
  return id;
}

const hasId = (node: PmNode): boolean => (BLOCK_TYPES as readonly string[]).includes(node.type.name);

/** Whether a block says anything: words, a formula, a picture, a file. */
const hasContent = (node: PmNode): boolean => node.isAtom || node.content.size > 0;

/** The positions of the blocks that need a new id: those without one, and the copies of an id (a block split in two
 *  keeps it on the first part with something in it, else on the first). */
export function blocksWithoutIds(doc: PmNode): number[] {
  const byId = new Map<string, { pos: number; node: PmNode }[]>();
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (!hasId(node)) return !node.isAtom;
    const id: unknown = node.attrs.blockId;
    if (typeof id !== 'string' || !id) out.push(pos);
    else byId.set(id, [...(byId.get(id) ?? []), { pos, node }]);
    return false;
  });
  for (const copies of byId.values()) {
    if (copies.length < 2) continue;
    const keeper = copies.find((c) => hasContent(c.node)) ?? copies[0];
    for (const c of copies) if (c !== keeper) out.push(c.pos);
  }
  return out.sort((a, b) => a - b);
}

function withoutIds(fragment: Fragment): Fragment {
  const nodes: PmNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      nodes.push(node);
      return;
    }
    const attrs = hasId(node) && node.attrs.blockId ? { ...node.attrs, blockId: null } : node.attrs;
    nodes.push(node.type.create(attrs, withoutIds(node.content), node.marks));
  });
  return Fragment.fromArray(nodes);
}

/** What is pasted, without block ids: the blocks pasted are new ones. */
export const pastedWithoutIds = (slice: Slice): Slice =>
  new Slice(withoutIds(slice.content), slice.openStart, slice.openEnd);

/** The change that gives every block without an id one (null when every block has one). */
export function idsTr(state: EditorState, random?: () => number): Transaction | null {
  const missing = blocksWithoutIds(state.doc);
  if (!missing.length) return null;
  const tr = state.tr;
  for (const pos of missing) tr.setNodeAttribute(pos, 'blockId', newBlockId(random));
  return tr;
}

/** The ids of the blocks, in the order they are read (with where each one is). */
export function blockIds(doc: PmNode): { id: string; pos: number }[] {
  const out: { id: string; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (!hasId(node)) return !node.isAtom;
    const id: unknown = node.attrs.blockId;
    if (typeof id === 'string' && id) out.push({ id, pos });
    return false;
  });
  return out;
}

export const BlockIds = Extension.create({
  name: 'blockIds',
  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-block'),
            renderHTML: (attrs: Record<string, unknown>) =>
              typeof attrs.blockId === 'string' ? { 'data-block': attrs.blockId } : {},
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIds'),
        appendTransaction: (transactions, _old, state) =>
          transactions.some((t) => t.docChanged) ? idsTr(state) : null,
      }),
    ];
  },
});
