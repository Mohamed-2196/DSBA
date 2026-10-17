import { describe, expect, it } from 'vitest';
import { LINE, PAGE_GAP, PAPER_BASE, PAPER_LINES, SHEET_HEIGHT, TEXT_TOP, clampZoom, fitZoom, layoutSheets, paperFor, sheetAt, sheetsOf, textSheets } from './layout';

describe('layout', () => {
  it('rules a sheet of paper in whole lines, about A4’s shape', () => {
    expect(SHEET_HEIGHT).toBe(LINE * PAPER_LINES);
    expect(Math.abs(SHEET_HEIGHT / 800 - 297 / 210)).toBeLessThan(0.015);
    expect(TEXT_TOP % LINE).toBe(0); // the text starts on a line
  });

  it('stacks PDF pages, then paper, in sheet units', () => {
    const sheets = sheetsOf([{ width: 600, height: 800 }, { width: 800, height: 600 }], 2);
    expect(sheets.map((s) => [s.index, s.kind, s.height])).toEqual([
      [0, 'pdf', 1067],
      [1, 'pdf', 600],
      [PAPER_BASE, 'paper', SHEET_HEIGHT],
      [PAPER_BASE + 1, 'paper', SHEET_HEIGHT],
    ]);
    const l = layoutSheets(sheets);
    expect(l.sheets[1].top).toBe(1067 + PAGE_GAP);
    expect(l.paperTop).toBe(1067 + PAGE_GAP + 600 + PAGE_GAP);
    expect(l.sheets[3].top - l.sheets[2].top).toBe(SHEET_HEIGHT); // paper sheets touch
    expect(l.paperHeight).toBe(2 * SHEET_HEIGHT);
    expect(l.height).toBe(l.paperTop + 2 * SHEET_HEIGHT);
    expect(sheetAt(l, 10)?.index).toBe(0);
    expect(sheetAt(l, l.paperTop + 5)?.index).toBe(PAPER_BASE);
    expect(sheetAt(l, 1e6)?.index).toBe(PAPER_BASE + 1);
  });

  it('has no paper on a PDF without pages of its own', () => {
    const l = layoutSheets(sheetsOf([{ width: 600, height: 800 }], 0));
    expect(l.paperHeight).toBe(0);
    expect(l.paperTop).toBe(l.height);
  });

  it('fits a sheet to the space, within the zoom range', () => {
    expect(fitZoom(848)).toBe(1);
    expect(fitZoom(5000)).toBe(1.5);
    expect(fitZoom(100)).toBe(0.3);
    expect(clampZoom(9)).toBe(4);
  });

  it('knows how much paper the typed text needs, and which pages it is on', () => {
    expect(paperFor(0)).toBe(1);
    expect(paperFor(SHEET_HEIGHT - TEXT_TOP - LINE)).toBe(1);
    expect(paperFor(SHEET_HEIGHT - TEXT_TOP)).toBe(2); // a line is kept free below the text
    expect(textSheets(0)).toBe(0);
    expect(textSheets(LINE)).toBe(1);
    expect(textSheets(SHEET_HEIGHT)).toBe(2);
  });
});
