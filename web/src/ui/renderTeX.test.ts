import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { renderTeX } from './renderTeX';

describe('renderTeX', () => {
  it('sets a formula, with MathML for screen readers', () => {
    const html = renderTeX(katex, '\\frac{a}{b}', false);
    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
    expect(renderTeX(katex, 'x^2', true)).toContain('katex-display');
  });

  it('shows a mistake instead of throwing', () => {
    expect(renderTeX(katex, '\\frac{a}{', false)).toContain('katex-error');
  });

  it('never lets markup or links through', () => {
    const html = renderTeX(katex, '\\href{javascript:alert(1)}{x} <img src=x onerror=alert(1)>', false);
    // The source is only ever echoed as escaped text (the MathML annotation), never as a link or a tag.
    expect(html).not.toMatch(/<a\b|href=/);
    expect(html).not.toContain('<img');
    expect(renderTeX(katex, '\\htmlClass{x}{y}', false)).not.toContain('class="x"');
  });
});
