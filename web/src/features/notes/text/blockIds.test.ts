import { Schema, Slice } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { blockIds, blocksWithoutIds, idsTr, newBlockId, pastedWithoutIds } from './blockIds';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', attrs: { blockId: { default: null } } },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph+' },
    image: { group: 'block', atom: true, attrs: { blockId: { default: null } } },
    text: {},
  },
});
const p = (t: string, blockId: string | null = null) =>
  schema.nodes.paragraph.create({ blockId }, t ? schema.text(t) : undefined);
const list = (...items: ReturnType<typeof p>[]) =>
  schema.nodes.bulletList.create(
    null,
    items.map((i) => schema.nodes.listItem.create(null, i)),
  );
const stateOf = (...blocks: ReturnType<typeof p>[]) =>
  EditorState.create({ schema, doc: schema.nodes.doc.create(null, blocks) });

describe('block ids', () => {
  it('are made of letters and digits', () => {
    expect(newBlockId()).toMatch(/^[a-z0-9]{10}$/);
    expect(newBlockId(() => 0)).toBe('aaaaaaaaaa');
  });

  it('are missing from new blocks and from copies, in lists too', () => {
    const state = stateOf(p('one', 'a'), p('two'), list(p('item', 'a'), p('next', 'b')), schema.nodes.image.create());
    const missing = blocksWithoutIds(state.doc);
    expect(missing.map((pos) => state.doc.nodeAt(pos)?.textContent || state.doc.nodeAt(pos)?.type.name)).toEqual([
      'two',
      'item',
      'image',
    ]);
  });

  it('are given where they are missing, and only there', () => {
    let n = 0;
    const state = stateOf(p('one', 'a'), p('two'), p('three', 'a'));
    const tr = idsTr(state, () => (n++ % 36) / 36);
    expect(tr).not.toBeNull();
    const after = state.apply(tr!);
    const ids = blockIds(after.doc).map((b) => b.id);
    expect(ids[0]).toBe('a');
    expect(new Set(ids).size).toBe(3);
    expect(idsTr(after)).toBeNull();
  });

  it('are listed in reading order with their places', () => {
    const state = stateOf(p('one', 'a'), list(p('item', 'b')), p('end', 'c'));
    expect(blockIds(state.doc).map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(state.doc.nodeAt(blockIds(state.doc)[1].pos)?.textContent).toBe('item');
  });

  it('stay with the words when a line is split: Enter at its start adds the empty line above', () => {
    const state = stateOf(p('', 'x'), p('Second line', 'x'), p('Third', 'y'));
    expect(blocksWithoutIds(state.doc)).toEqual([0]);
    const end = stateOf(p('Second line', 'x'), p('', 'x'));
    expect(blocksWithoutIds(end.doc)).toEqual([end.doc.child(0).nodeSize]);
    const middle = stateOf(p('Sec', 'x'), p('ond', 'x'));
    expect(blocksWithoutIds(middle.doc)).toEqual([middle.doc.child(0).nodeSize]);
  });

  it('are left out of what is pasted', () => {
    const slice = new Slice(stateOf(p('one', 'a'), list(p('two', 'b'))).doc.content, 0, 0);
    const pasted = pastedWithoutIds(slice);
    const ids: unknown[] = [];
    pasted.content.descendants((n) => {
      if (n.type.name === 'paragraph') ids.push(n.attrs.blockId);
    });
    expect(ids).toEqual([null, null]);
    expect(pasted.content.textBetween(0, pasted.content.size, ' ')).toBe('one two');
  });
});
