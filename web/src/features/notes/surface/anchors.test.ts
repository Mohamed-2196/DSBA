import { describe, expect, it } from 'vitest';
import type { Stroke } from '../../../api/types';
import {
  END_REACH,
  anchorAt,
  anchoredAt,
  middleOnPaper,
  relocate,
  unanchoredChanges,
  type TextLayout,
} from './anchors';
import { PAPER_BASE, SHEET_HEIGHT, TEXT_TOP } from './layout';

/** A short stroke whose middle is at y on its sheet. */
const stroke = (id: string, y: number, extra: Partial<Stroke> = {}): Stroke => ({
  id,
  tool: 'pen',
  color: '#1f2933',
  width: 2,
  points: [100, y - 5, 0.5, 120, y + 5, 0.5],
  ...extra,
});

const text = (...blocks: [string, number, number][]): TextLayout => ({
  blocks: blocks.map(([id, top, bottom]) => ({ id, top, bottom })),
  end: blocks.length ? blocks[blocks.length - 1][2] : TEXT_TOP,
});

const sheetsOf = (map: Record<number, Stroke[]>) => (sheet: number) => map[sheet] ?? [];

describe('anchoring a stroke', () => {
  const layout = text(['a', 64, 96], ['b', 128, 192]);

  it('goes with the block beside it, or the block below a gap', () => {
    expect(anchorAt(80, layout)).toEqual({ block: 'a', dy: 16 });
    expect(anchorAt(110, layout)).toEqual({ block: 'b', dy: -18 });
    expect(anchorAt(150, layout)).toEqual({ block: 'b', dy: 22 });
  });

  it('goes with the end of the text a little below it, and keeps its place further down or above the text', () => {
    expect(anchorAt(250, layout)).toEqual({ block: null, dy: 58 });
    expect(anchorAt(192 + END_REACH + 1, layout)).toBeNull();
    expect(anchorAt(TEXT_TOP - 1, layout)).toBeNull();
  });

  it('says where its middle goes, or nothing once its block is gone', () => {
    expect(anchoredAt({ block: 'b', dy: -18 }, layout)).toBe(110);
    expect(anchoredAt({ block: null, dy: 58 }, layout)).toBe(250);
    expect(anchoredAt({ block: 'gone', dy: 4 }, layout)).toBeNull();
  });

  it('measures a stroke on the paper', () => {
    expect(middleOnPaper(stroke('s', 100), PAPER_BASE + 1)).toBe(SHEET_HEIGHT + 100);
  });
});

describe('relocating the ink', () => {
  it('anchors strokes that have no anchor, and leaves the rest', () => {
    const layout = text(['a', 64, 96]);
    const free = stroke('s1', 80);
    const margin = stroke('s2', 20);
    const r = relocate(sheetsOf({ [PAPER_BASE]: [free, margin] }), 1, layout);
    expect(r.pages).toBe(1);
    expect(r.sheets.get(PAPER_BASE)?.map((s) => s.anchor ?? null)).toEqual([{ block: 'a', dy: 16 }, null]);
    expect(r.sheets.get(PAPER_BASE)?.[1]).toBe(margin);
  });

  it('changes nothing when the text is where the anchors say', () => {
    const layout = text(['a', 64, 96]);
    const r = relocate(sheetsOf({ [PAPER_BASE]: [stroke('s', 80, { anchor: { block: 'a', dy: 16 } })] }), 1, layout);
    expect(r.sheets.size).toBe(0);
  });

  it('moves strokes down with their block when text is added above it', () => {
    // a picture 200 units tall went in above block b
    const layout = text(['a', 64, 96], ['pic', 96, 296], ['b', 296, 328]);
    const under = stroke('s', 350, { anchor: { block: 'b', dy: 54 } }); // was at 150 beside b at 96
    const besideA = stroke('t', 80, { anchor: { block: 'a', dy: 16 } });
    const r = relocate(
      sheetsOf({ [PAPER_BASE]: [besideA, stroke('u', 150, { anchor: { block: 'b', dy: 54 } })] }),
      1,
      layout,
    );
    const moved = r.sheets.get(PAPER_BASE) ?? [];
    expect(moved[0]).toBe(besideA);
    expect(middleOnPaper(moved[1], PAPER_BASE)).toBe(350);
    expect(moved[1].anchor).toEqual(under.anchor);
  });

  it('carries a stroke onto the next page, and asks for a page when there is none', () => {
    const layout = text(['a', SHEET_HEIGHT + 40, SHEET_HEIGHT + 72]);
    const s = stroke('s', 1000, { anchor: { block: 'a', dy: 16 } });
    const two = relocate(sheetsOf({ [PAPER_BASE]: [s] }), 2, layout);
    expect(two.sheets.get(PAPER_BASE)).toEqual([]);
    const onNext = two.sheets.get(PAPER_BASE + 1) ?? [];
    expect(middleOnPaper(onNext[0], PAPER_BASE + 1)).toBe(SHEET_HEIGHT + 56);
    const one = relocate(sheetsOf({ [PAPER_BASE]: [s] }), 1, layout);
    expect(one.pages).toBe(2);
    expect(middleOnPaper((one.sheets.get(PAPER_BASE) ?? [])[0], PAPER_BASE)).toBe(SHEET_HEIGHT + 56);
  });

  it('anchors a stroke again where it is when its block is gone', () => {
    const layout = text(['b', 64, 96]);
    const s = stroke('s', 80, { anchor: { block: 'gone', dy: 300 } });
    const r = relocate(sheetsOf({ [PAPER_BASE]: [s] }), 1, layout);
    const now = (r.sheets.get(PAPER_BASE) ?? [])[0];
    expect(now.anchor).toEqual({ block: 'b', dy: 16 });
    expect(now.points).toEqual(s.points);
  });

  it('follows the end of the text', () => {
    const before = stroke('s', 260, { anchor: { block: null, dy: 100 } });
    const r = relocate(sheetsOf({ [PAPER_BASE]: [before] }), 1, text(['a', 64, 192]));
    expect(middleOnPaper((r.sheets.get(PAPER_BASE) ?? [])[0], PAPER_BASE)).toBe(292);
  });
});

describe('a change the student makes', () => {
  it('lets go of the anchors of the strokes it made or changed', () => {
    const kept = stroke('k', 80, { anchor: { block: 'a', dy: 1 } });
    const dragged = stroke('d', 90, { anchor: { block: 'a', dy: 2 } });
    const after = unanchoredChanges([kept], [kept, dragged]);
    expect(after[0]).toBe(kept);
    expect('anchor' in after[1]).toBe(false);
  });
});
