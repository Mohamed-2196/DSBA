// A note's document holds its free pictures beside the typed text: the editor keeps the text (ProseMirror), and the
// document's own `attrs.pictures` keeps the pictures (geometry.ts), saved, kept on this device and sent with the text.
// The editor never holds them: a change to a picture never redraws the text. Putting a picture in line, or making one
// free, changes both: the editor's part is a transaction here (one step of its history, which the note's timeline
// joins with the pictures' change: useTimeline).
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PmNode } from '@tiptap/pm/model';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { RichDoc } from '../draft';
import type { Drop } from '../text/blocks';
import { picturesFrom, toStored, type FreePicture } from './geometry';

const read = new WeakMap<object, FreePicture[]>();
const NONE: readonly FreePicture[] = [];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The free pictures in a document's `pictures` attribute (read once per version of the list). */
export function picturesIn(raw: unknown): readonly FreePicture[] {
  if (!Array.isArray(raw) || !raw.length) return NONE;
  let list = read.get(raw);
  if (!list) {
    list = picturesFrom(raw);
    read.set(raw, list);
  }
  return list;
}

/** The document's free pictures. */
export const picturesOfDoc = (doc: RichDoc): readonly FreePicture[] =>
  picturesIn(isRecord(doc.attrs) ? doc.attrs.pictures : undefined);

/** The document with `pictures` as its free pictures (none: no attributes at all). */
export function withFreePictures(doc: RichDoc, pictures: readonly FreePicture[]): RichDoc {
  const { attrs, ...rest } = doc;
  const others = isRecord(attrs) ? Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'pictures')) : {};
  const next = pictures.length ? { ...others, pictures: pictures.map(toStored) } : others;
  return Object.keys(next).length ? { ...rest, attrs: next } : rest;
}

/** The editor's text (`json`, as it writes it) with the free pictures `from` holds. */
export const keepPictures = (json: RichDoc, from: RichDoc): RichDoc => withFreePictures(json, picturesOfDoc(from));

/** The typed text alone, as the editor takes it. */
export function textOf(doc: RichDoc): RichDoc {
  const content = doc.content;
  return { type: 'doc', content: Array.isArray(content) ? content : [] };
}

/** How many pictures are in the text. */
export function inlinePictureCount(doc: PmNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === 'image') n += 1;
    return !node.isAtom;
  });
  return n;
}

/** The picture in the text at `pos` taken out of it (to be made free): a step of its own in the editor's history. */
export function takeOutTr(state: EditorState, pos: number): Transaction | null {
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'image') return null;
  return closeHistory(state.tr.delete(pos, pos + node.nodeSize));
}

/** A picture with `attrs` put in the text where `drop` says, selected there, with a line to type on after it: a step of
 *  its own in the editor's history. */
export function putInTr(state: EditorState, drop: Drop, attrs: Record<string, unknown>): Transaction | null {
  const { image, paragraph } = state.schema.nodes;
  if (!image) return null;
  const filler = paragraph ? Array.from({ length: drop.lines }, () => paragraph.create()) : [];
  const at = Math.min(drop.pos, state.doc.content.size);
  const tr = state.tr.insert(at, [...filler, image.create(attrs)]);
  const pos = at + filler.reduce((n, p) => n + p.nodeSize, 0);
  // typing goes on below it, never over it
  if (!tr.doc.nodeAt(pos + 1)?.isTextblock && paragraph) tr.insert(pos + 1, paragraph.create());
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  return closeHistory(tr.scrollIntoView());
}
