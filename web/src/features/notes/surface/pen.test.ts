import { describe, expect, it } from 'vitest';
import { erasesByButton, hoverAfter, hoverDot, inAir } from './pen';
import { DEFAULT_PENS } from './tools';

const pen = (button: number, buttons: number) => ({ pointerType: 'pen', button, buttons });

describe('erasesByButton', () => {
  it('erases when a pen comes down with its eraser end or eraser button (button 5)', () => {
    expect(erasesByButton(pen(5, 32))).toBe(true);
    expect(erasesByButton(pen(5, 33))).toBe(true);
  });

  it('erases while the eraser button is held (buttons has 32), as the pen moves', () => {
    expect(erasesByButton(pen(-1, 33), true)).toBe(true);
    expect(erasesByButton(pen(-1, 32), true)).toBe(true);
  });

  it('draws with the tip alone, or with the barrel button', () => {
    expect(erasesByButton(pen(0, 1))).toBe(false);
    expect(erasesByButton(pen(-1, 1), true)).toBe(false);
    expect(erasesByButton(pen(2, 3))).toBe(false);
  });

  it('stops erasing when the button is let go mid-line (button 5 changes, buttons loses 32)', () => {
    expect(erasesByButton(pen(5, 1), true)).toBe(false);
  });

  it('never erases for a mouse or a finger, whatever their buttons say', () => {
    expect(erasesByButton({ pointerType: 'mouse', button: 5, buttons: 32 })).toBe(false);
    expect(erasesByButton({ pointerType: 'touch', button: 0, buttons: 33 })).toBe(false);
  });
});

describe('hoverAfter', () => {
  const ev = (type: string, pointerType: string, buttons: number) => ({ type, pointerType, buttons });

  it('shows the dot while a pen moves without touching', () => {
    expect(hoverAfter(ev('pointermove', 'pen', 0))).toBe('show');
  });

  it('shows it for a pen hovering with its eraser end or a button held', () => {
    expect(hoverAfter(ev('pointermove', 'pen', 32))).toBe('show');
    expect(hoverAfter(ev('pointermove', 'pen', 2))).toBe('show');
  });

  it('hides it when the pen touches down or writes', () => {
    expect(hoverAfter(ev('pointerdown', 'pen', 1))).toBe('hide');
    expect(hoverAfter(ev('pointermove', 'pen', 1))).toBe('hide');
  });

  it('hides it when the pen leaves, or the pointer is cancelled', () => {
    expect(hoverAfter(ev('pointerleave', 'pen', 0))).toBe('hide');
    expect(hoverAfter(ev('pointercancel', 'pen', 0))).toBe('hide');
  });

  it('hides it when a finger touches down', () => {
    expect(hoverAfter(ev('pointerdown', 'touch', 1))).toBe('hide');
  });

  it('leaves it alone while a resting palm shifts, so it does not flicker', () => {
    expect(hoverAfter(ev('pointermove', 'touch', 1))).toBe('keep');
  });

  it('never shows it for a mouse', () => {
    expect(hoverAfter(ev('pointermove', 'mouse', 0))).toBe('hide');
    expect(hoverAfter(ev('pointerdown', 'mouse', 1))).toBe('hide');
  });
});

describe('hoverDot', () => {
  const pens = {
    ...DEFAULT_PENS,
    pen: { color: '#1558f0', width: 4.4 },
    highlighter: { color: '#8ce99a', width: 22 },
    eraser: { mode: 'stroke' as const, size: 28 },
  };
  // zoomed in far enough (250%) that the pen's own width is bigger than the smallest dot
  const near = 2.5;

  it('is the pen: its colour, the width of its line', () => {
    expect(hoverDot('pen', pens, false, false, near)).toEqual({ kind: 'ink', r: 2.2, color: '#1558f0' });
  });

  it('is the highlighter: its colour, its width', () => {
    expect(hoverDot('highlighter', pens, false, false, 1)).toEqual({ kind: 'highlighter', r: 11, color: '#8ce99a' });
  });

  it('is the eraser: a ring its size', () => {
    expect(hoverDot('eraser', pens, false, false, 1)).toEqual({ kind: 'eraser', r: 14 });
  });

  it('is the eraser while the eraser button is held, whatever tool is picked', () => {
    expect(hoverDot('pen', pens, true, false, 1)).toEqual({ kind: 'eraser', r: 14 });
    expect(hoverDot('type', pens, true, false, 1)).toEqual({ kind: 'eraser', r: 14 });
  });

  it('is the pen while typing: a stylus picks the pen when it touches', () => {
    expect(hoverDot('type', pens, false, false, near)).toEqual({ kind: 'ink', r: 2.2, color: '#1558f0' });
  });

  it('is at least 6 screen pixels across at every zoom, so the finest pen still shows one', () => {
    const fine = { ...pens, pen: { color: '#1f2933', width: 1.6 } };
    for (const zoom of [0.3, 0.75, 1, 1.1, 2.5])
      expect(hoverDot('pen', fine, false, false, zoom)?.r).toBeCloseTo(3 / zoom);
    const faint = { ...pens, highlighter: { color: '#8ce99a', width: 2 } };
    expect(hoverDot('highlighter', faint, false, false, 0.5)?.r).toBeCloseTo(6);
  });

  it('is nothing for the lasso and the laser (the laser shows its own trail)', () => {
    expect(hoverDot('lasso', pens, false, false, 1)).toBeNull();
    expect(hoverDot('laser', pens, false, false, 1)).toBeNull();
  });

  it('is nothing on a note that cannot be written on', () => {
    expect(hoverDot('pen', pens, false, true, 1)).toBeNull();
    expect(hoverDot('eraser', pens, true, true, 1)).toBeNull();
  });
});

describe('inAir', () => {
  const ev = (pointerType: string, buttons: number, pressure: number) => ({ pointerType, buttons, pressure });

  it('is a pen pressing a button while it hovers: no contact, no pressure', () => {
    expect(inAir(ev('pen', 32, 0))).toBe(true); // the eraser button, above the page
    expect(inAir(ev('pen', 2, 0))).toBe(true); // the barrel button, above the page
  });

  it('is not a pen touching the page, with its tip or its eraser end', () => {
    expect(inAir(ev('pen', 1, 0.4))).toBe(false);
    expect(inAir(ev('pen', 32, 0.4))).toBe(false); // the eraser end has no contact bit, only pressure
  });

  it('is not a tip that reports contact but no pressure (some pens and drivers)', () => {
    expect(inAir(ev('pen', 1, 0))).toBe(false);
  });

  it('is never a finger or a mouse', () => {
    expect(inAir(ev('touch', 0, 0))).toBe(false);
    expect(inAir(ev('mouse', 1, 0))).toBe(false);
  });
});
