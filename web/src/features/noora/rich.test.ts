import { describe, expect, it } from 'vitest';
import { cells, parseInline, parseRich, plainText } from './rich';

describe('parseRich', () => {
  it('reads headings, lists, quotes, rules and code', () => {
    const src = ['### The method', 'Two steps:', '1. Write the MGF', '2. Differentiate', '', '- one', '- two', '> a quote', '---', '```r', 'mean(x)', '```'].join('\n');
    expect(parseRich(src)).toEqual([
      { type: 'heading', text: 'The method' },
      { type: 'p', text: 'Two steps:' },
      { type: 'ol', start: 1, items: ['Write the MGF', 'Differentiate'] },
      { type: 'ul', items: ['one', 'two'] },
      { type: 'quote', text: 'a quote' },
      { type: 'hr' },
      { type: 'code', lang: 'r', text: 'mean(x)' },
    ]);
  });

  it('keeps a numbered list’s start and folds indented lines into the item above', () => {
    expect(parseRich('3. third\n   carries on\n4. fourth')).toEqual([{ type: 'ol', start: 3, items: ['third\ncarries on', 'fourth'] }]);
  });

  it('reads a table with its alignment, padding short rows', () => {
    expect(parseRich('| Test | p |\n|:---|---:|\n| t | 0.04 |\n| z |')).toEqual([
      { type: 'table', head: ['Test', 'p'], align: ['left', 'right'], rows: [['t', '0.04'], ['z', '']] },
    ]);
  });

  it('reads formulas on lines of their own, and marks one still being written', () => {
    expect(parseRich('$$E[X] = \\mu$$')).toEqual([{ type: 'math', tex: 'E[X] = \\mu', open: false }]);
    expect(parseRich('\\[\na^2 + b^2\n\\]')).toEqual([{ type: 'math', tex: 'a^2 + b^2', open: false }]);
    expect(parseRich('So:\n$$M(t) = ')).toEqual([
      { type: 'p', text: 'So:' },
      { type: 'math', tex: 'M(t) =', open: true },
    ]);
  });

  it('keeps an unclosed code fence as code (an answer still arriving)', () => {
    expect(parseRich('```python\nprint(1)')).toEqual([{ type: 'code', lang: 'python', text: 'print(1)' }]);
  });
});

describe('cells', () => {
  it('splits at pipes that are not escaped', () => {
    expect(cells('| a | b \\| c |')).toEqual(['a', 'b | c']);
  });
});

describe('parseInline', () => {
  it('reads code, formulas, bold, italic and links', () => {
    expect(parseInline('Use `lm()`, $x^2$, \\(\\beta\\), **the MGF**, *roughly* and [the lessons](/modules/st2133).')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'code', text: 'lm()' },
      { type: 'text', text: ', ' },
      { type: 'math', tex: 'x^2' },
      { type: 'text', text: ', ' },
      { type: 'math', tex: '\\beta' },
      { type: 'text', text: ', ' },
      { type: 'strong', children: [{ type: 'text', text: 'the MGF' }] },
      { type: 'text', text: ', ' },
      { type: 'em', children: [{ type: 'text', text: 'roughly' }] },
      { type: 'text', text: ' and ' },
      { type: 'link', text: 'the lessons', href: '/modules/st2133' },
      { type: 'text', text: '.' },
    ]);
  });

  it('leaves prices and underscores alone', () => {
    expect(parseInline('It costs $5 or $10 and R_f is the rate')).toEqual([{ type: 'text', text: 'It costs $5 or $10 and R_f is the rate' }]);
  });

  it('reads a formula inside bold', () => {
    expect(parseInline('**mean $\\mu$**')).toEqual([{ type: 'strong', children: [{ type: 'text', text: 'mean ' }, { type: 'math', tex: '\\mu' }] }]);
  });
});

describe('plainText', () => {
  it('drops the marks and keeps the words', () => {
    expect(plainText('### Steps\n**Bold** and [the calendar](/calendar).\n```r\nx\n```')).toBe('Steps\nBold and the calendar.\n\nx');
  });
});
