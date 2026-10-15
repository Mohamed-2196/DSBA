import { describe, expect, it } from 'vitest';
import { PAGE_GAP, PAPER_BASE, PAPER_GAP, SHEET_HEIGHT, fitZoom, layoutSheets, sheetAt, sheetsOf } from './layout';

describe('layout', () => {
  it('stacks PDF pages, then paper', () => {
    const sheets = sheetsOf([{ width: 600, height: 800 }, { width: 800, height: 600 }], 2);
    expect(sheets.map((s) => [s.index, s.kind, s.height])).toEqual([
      [0, 'pdf', 1067],
      [1, 'pdf', 600],
      [PAPER_BASE, 'paper', SHEET_HEIGHT],
      [PAPER_BASE + 1, 'paper', SHEET_HEIGHT],
    ]);
    const l = layoutSheets(sheets, 0.5);
    expect(l.sheets[1].top).toBe(1067 * 0.5 + PAGE_GAP);
    expect(l.paperTop).toBe(1067 * 0.5 + PAGE_GAP + 300 + PAPER_GAP);
    expect(l.sheets[3].top - l.sheets[2].top).toBe(SHEET_HEIGHT * 0.5); // paper sheets touch
    expect(l.paperHeight).toBe(SHEET_HEIGHT);
    expect(sheetAt(l, 10)?.index).toBe(0);
    expect(sheetAt(l, l.paperTop + 5)?.index).toBe(PAPER_BASE);
    expect(sheetAt(l, 1e6)?.index).toBe(PAPER_BASE + 1);
  });

  it('fits a sheet to the space', () => {
    expect(fitZoom(848)).toBe(1);
    expect(fitZoom(5000)).toBe(1.5);
    expect(fitZoom(100)).toBe(0.3);
  });
});
