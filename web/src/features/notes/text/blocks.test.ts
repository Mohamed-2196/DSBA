import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { dropTarget, moveBlock, staysPut, type BlockBox } from './blocks';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    image: { group: 'block', atom: true, attrs: { upload: { default: '' }, x: { default: 0.5 } } },
    text: {},
  },
});
const p = (t: string) => schema.nodes.paragraph.create(null, t ? schema.text(t) : undefined);
const img = (upload: string) => schema.nodes.image.create({ upload });
const stateOf = (...blocks: ReturnType<typeof p>[]) =>
  EditorState.create({ schema, doc: schema.nodes.doc.create(null, blocks) });
const names = (s: EditorState) => {
  const out: string[] = [];
  s.doc.forEach((n) => out.push(n.type.name === 'image' ? `[${String(n.attrs.upload)}]` : n.textContent || '·'));
  return out;
};

describe('dropping a block', () => {
  const blocks: BlockBox[] = [
    { pos: 0, size: 5, top: 100, bottom: 132 },
    { pos: 5, size: 1, top: 132, bottom: 332 },
    { pos: 6, size: 5, top: 332, bottom: 364 },
  ];

  it('lands before or after the block it is dropped on', () => {
    expect(dropTarget(blocks, 110, 32)).toEqual({ pos: 0, lines: 0, at: 100 });
    expect(dropTarget(blocks, 125, 32)).toEqual({ pos: 5, lines: 0, at: 132 });
    expect(dropTarget(blocks, 300, 32)).toEqual({ pos: 6, lines: 0, at: 332 });
  });

  it('lands below the end of the text with empty lines before it', () => {
    expect(dropTarget(blocks, 370, 32)).toEqual({ pos: 11, lines: 0, at: 364 });
    expect(dropTarget(blocks, 364 + 3 * 32 + 5, 32)).toEqual({ pos: 11, lines: 3, at: 364 + 96 });
    expect(dropTarget([], 50, 32)).toEqual({ pos: 0, lines: 0, at: 50 });
  });

  it('knows a drop that changes nothing', () => {
    expect(staysPut(5, 1, { pos: 5, lines: 0, at: 0 })).toBe(true);
    expect(staysPut(5, 1, { pos: 6, lines: 0, at: 0 })).toBe(true);
    expect(staysPut(5, 1, { pos: 6, lines: 2, at: 0 })).toBe(false);
  });
});

describe('moving a block', () => {
  it('moves a picture down, up and below the end, and selects it there', () => {
    const s = stateOf(p('one'), img('a'), p('two'), p('three'));
    // positions: one 0-5, [a] 5-6, two 6-11, three 11-18
    let tr = moveBlock(s, 5, { pos: 11, lines: 0, at: 0 }, { x: 0 });
    expect(tr).not.toBeNull();
    let next = s.apply(tr!);
    expect(names(next)).toEqual(['one', 'two', '[a]', 'three']);
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect((next.selection as NodeSelection).node.attrs.x).toBe(0);

    tr = moveBlock(next, 10, { pos: 0, lines: 0, at: 0 });
    next = next.apply(tr!);
    expect(names(next)).toEqual(['[a]', 'one', 'two', 'three']);
    expect((next.selection as NodeSelection).node.attrs.upload).toBe('a');

    tr = moveBlock(next, 0, { pos: next.doc.content.size, lines: 2, at: 0 });
    next = next.apply(tr!);
    expect(names(next)).toEqual(['one', 'two', 'three', '·', '·', '[a]']);
    expect((next.selection as NodeSelection).node.attrs.upload).toBe('a');
  });

  it('refuses a drop inside the block itself', () => {
    const s = stateOf(p('one'), p('two'));
    expect(moveBlock(s, 0, { pos: 2, lines: 0, at: 0 })).toBeNull();
  });
});
