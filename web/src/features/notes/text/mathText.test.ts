import { describe, expect, it } from 'vitest';
import { joinFormulaLines, lineParts, mathParts, plainText } from './mathText';

describe('formulas written as text', () => {
  it('finds formulas in a line and on their own', () => {
    expect(mathParts('so $x^2$ grows, and $$E[X]=\\mu$$ is the mean')).toEqual([
      { kind: 'text', text: 'so ' },
      { kind: 'math', tex: 'x^2', display: false },
      { kind: 'text', text: ' grows, and ' },
      { kind: 'math', tex: 'E[X]=\\mu', display: true },
      { kind: 'text', text: ' is the mean' },
    ]);
  });

  it('leaves prices, escaped dollars and unclosed ones as text', () => {
    expect(mathParts('It costs $5 to $10.')).toEqual([{ kind: 'text', text: 'It costs $5 to $10.' }]);
    expect(mathParts('a \\$5 note')).toEqual([{ kind: 'text', text: 'a \\$5 note' }]);
    expect(mathParts('cut at $\\frac{1}{')).toEqual([{ kind: 'text', text: 'cut at $\\frac{1}{' }]);
    expect(mathParts('$ x $')).toEqual([{ kind: 'text', text: '$ x $' }]);
  });

  it('makes one line for a list, cut without cutting a formula', () => {
    expect(lineParts('Formula $E[X]$\n\nSecond line', 160)).toEqual([
      { kind: 'text', text: 'Formula ' },
      { kind: 'math', tex: 'E[X]', display: false },
      { kind: 'text', text: ' Second line' },
    ]);
    expect(lineParts('x'.repeat(200), 10)).toEqual([{ kind: 'text', text: 'xxxxxxxxx…' }]);
    // a formula that doesn't fit is left out, not cut
    expect(lineParts('ab $\\frac{1}{2}$ c', 8)).toEqual([{ kind: 'text', text: 'ab…' }]);
    expect(lineParts('$$\\frac{1}{2}$$', 5)).toEqual([{ kind: 'text', text: '…' }]);
    expect(lineParts('$x$ and $$\\frac{1}{2}$$', 9)).toEqual([
      { kind: 'math', tex: 'x', display: false },
      { kind: 'text', text: ' and…' },
    ]);
    expect(lineParts('so $x$', 3)).toEqual([{ kind: 'text', text: 'so…' }]);
    expect(lineParts('', 10)).toEqual([]);
  });

  it('leaves out a formula on its own line that the text stops in the middle of', () => {
    expect(lineParts('Mean\n$$\\frac{1}{n}\\sum_{i=1}', 160)).toEqual([{ kind: 'text', text: 'Mean…' }]);
    expect(lineParts('$x$\n$$\\frac{1}{n}', 160)).toEqual([
      { kind: 'math', tex: 'x', display: false },
      { kind: 'text', text: ' …' },
    ]);
  });

  it('writes a line as plain text, formulas as their LaTeX', () => {
    expect(plainText(mathParts('So $x^2$ grows'))).toBe('So x^2 grows');
  });

  it('brings a formula written over several lines onto one', () => {
    expect(joinFormulaLines('Mean:\n$$\nE[X] =\n  \\sum x p(x)\n$$\nDone')).toBe(
      'Mean:\n$$E[X] = \\sum x p(x)$$\nDone',
    );
  });
});
