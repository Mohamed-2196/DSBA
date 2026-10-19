import { history, undo, undoDepth } from '@tiptap/pm/history';
import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection, type Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { PAPER_BASE } from '../surface/layout';
import { FULL } from '../text/picture';
import {
  inlinePictureCount,
  keepPictures,
  picturesOfDoc,
  putInTr,
  takeOutTr,
  textOf,
  withFreePictures,
} from './document';
import { toStored, type FreePicture } from './geometry';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    image: { group: 'block', atom: true, attrs: { upload: { default: '' }, width: { default: 1 } } },
    text: {},
  },
});
const p = (t: string) => schema.nodes.paragraph.create(null, t ? schema.text(t) : undefined);
const img = (upload: string) => schema.nodes.image.create({ upload });
const stateOf = (...blocks: ReturnType<typeof p>[]) =>
  EditorState.create({ schema, doc: schema.nodes.doc.create(null, blocks), plugins: [history()] });
const names = (s: EditorState) => {
  const out: string[] = [];
  s.doc.forEach((n) => out.push(n.type.name === 'image' ? `[${String(n.attrs.upload)}]` : n.textContent || '·'));
  return out;
};
const apply = (s: EditorState, tr: Transaction | null): EditorState => {
  if (!tr) throw new Error('no change');
  return s.apply(tr);
};

const free = (id: string): FreePicture => ({
  id,
  upload: `u-${id}`,
  sheet: PAPER_BASE,
  x: 10,
  y: 20,
  w: 300,
  h: 200,
  angle: 0,
  ratio: 1.5,
  crop: FULL,
  alt: '',
  caption: '',
});
const TEXT = [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }];

describe('free pictures in the note’s document', () => {
  it('keeps them in the document’s own attributes, and none means no attributes', () => {
    const doc = withFreePictures({ type: 'doc', content: TEXT }, [free('one')]);
    expect(doc).toEqual({ type: 'doc', content: TEXT, attrs: { pictures: [toStored(free('one'))] } });
    expect(picturesOfDoc(doc)).toEqual([free('one')]);
    expect(picturesOfDoc(doc)).toBe(picturesOfDoc(doc)); // read once while it doesn't change
    expect(withFreePictures(doc, [])).toEqual({ type: 'doc', content: TEXT });
    expect(picturesOfDoc({ type: 'doc', content: [] })).toEqual([]);
  });

  it('gives the editor the text alone, and keeps the pictures when the text changes', () => {
    const doc = withFreePictures({ type: 'doc', content: TEXT }, [free('one')]);
    expect(textOf(doc)).toEqual({ type: 'doc', content: TEXT });
    const typed = { type: 'doc', content: [...TEXT, { type: 'paragraph' }] };
    expect(picturesOfDoc(keepPictures(typed, doc))).toEqual([free('one')]);
    expect(keepPictures(typed, { type: 'doc', content: TEXT })).toEqual(typed);
  });

  it('counts the pictures in the text', () => {
    expect(inlinePictureCount(stateOf(p('a'), img('one'), p('b'), img('two')).doc)).toBe(2);
  });

  it('takes a picture out of the text in a step of its own', () => {
    let s = stateOf(p('a'), img('pic'), p('b'));
    s = apply(s, takeOutTr(s, 3));
    expect(names(s)).toEqual(['a', 'b']);
    expect(undoDepth(s)).toBe(1);
    expect(takeOutTr(s, 0)).toBeNull(); // a paragraph isn't a picture
    const only = stateOf(img('pic'));
    expect(names(apply(only, takeOutTr(only, 0)))).toEqual(['·']); // a line is left to type on
  });

  it('puts a picture in the text where it lands, selected, in a step of its own', () => {
    let s = stateOf(p('a'), p('b'));
    s = apply(s, putInTr(s, { pos: 3, lines: 0, at: 0 }, { upload: 'one', width: 0.5 }));
    expect(names(s)).toEqual(['a', '[one]', 'b']);
    expect(s.selection).toBeInstanceOf(NodeSelection);
    expect((s.selection as NodeSelection).node.attrs.width).toBe(0.5);
    let back = s;
    undo(s, (tr) => {
      back = s.apply(tr);
    });
    expect(names(back)).toEqual(['a', 'b']);
  });

  it('puts it below the end of the text with empty lines before it, and a line after it', () => {
    let s = stateOf(p('a'));
    s = apply(s, putInTr(s, { pos: 3, lines: 2, at: 0 }, { upload: 'one' }));
    expect(names(s)).toEqual(['a', '·', '·', '[one]', '·']);
  });
});
