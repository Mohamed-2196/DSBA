// Every block of the typed text that sits on a line of its own (a paragraph, a heading, a formula, a picture, a file …)
// has an id of its own (`blockId`), so handwriting can go with the block it was written beside (surface/anchors.ts).
// A new block gets one as it is made; a block split in two leaves its id with the first part; a copy pasted in gets a
// new one. Ids are only ever added: a block keeps its id while it lives.
import { Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
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

/** The positions of the blocks that need a new id: those without one, and every copy of an id after its first. */
export function blocksWithoutIds(doc: PmNode): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (!hasId(node)) return !node.isAtom;
    const id: unknown = node.attrs.blockId;
    if (typeof id !== 'string' || !id || seen.has(id)) out.push(pos);
    else seen.add(id);
    return false;
  });
  return out;
}

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
            keepOnSplit: false,
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
