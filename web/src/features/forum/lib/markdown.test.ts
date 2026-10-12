import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline } from './markdown';

const MEDIA = '/api/v1/media/7511c4f7-ffbf-4f8e-8500-93334507e674';

describe('parseBlocks', () => {
  it('reads paragraphs, lists, quotes and code', () => {
    const text = ['First line', 'same paragraph', '', '- one', '- two', '', '1. first', '2) second', '', '> quoted', '> still quoted', '', '```r', 'x <- c(1, 2)', '```'].join('\n');
    expect(parseBlocks(text)).toEqual([
      { type: 'p', text: 'First line\nsame paragraph' },
      { type: 'ul', items: ['one', 'two'] },
      { type: 'ol', items: ['first', 'second'] },
      { type: 'quote', text: 'quoted\nstill quoted' },
      { type: 'code', lang: 'r', text: 'x <- c(1, 2)' },
    ]);
  });

  it('shows a picture only when it is one the API serves, on a line of its own', () => {
    expect(parseBlocks(`![my working](${MEDIA})`)).toEqual([{ type: 'image', alt: 'my working', src: MEDIA }]);
    expect(parseBlocks('![x](https://evil.example/t.png)')[0].type).toBe('p');
    expect(parseBlocks(`see ![x](${MEDIA}) here`)[0].type).toBe('p');
    expect(parseBlocks(`![x](${MEDIA.toUpperCase()})`)[0].type).toBe('p');
  });

  it('keeps a fence language only when it is a short label', () => {
    expect(parseBlocks('```python\nx\n```')[0]).toEqual({ type: 'code', lang: 'python', text: 'x' });
    expect(parseBlocks('```r"><script>\nx\n```')[0]).toEqual({ type: 'code', lang: '', text: 'x' });
  });

  it('closes an unclosed fence at the end of the text', () => {
    expect(parseBlocks('```\na\nb')).toEqual([{ type: 'code', lang: '', text: 'a\nb' }]);
  });

  it('keeps Arabic text as it is, and Windows line ends work', () => {
    expect(parseBlocks('هل يمكن لأحد أن يشرح؟')).toEqual([{ type: 'p', text: 'هل يمكن لأحد أن يشرح؟' }]);
    expect(parseBlocks('a\r\nb')).toEqual([{ type: 'p', text: 'a\nb' }]);
  });

  it('turns nothing into nothing', () => {
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks(null)).toEqual([]);
    expect(parseBlocks('   \n\n  ')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('reads code, bold, italic and links', () => {
    expect(parseInline('use `dpois(2, 3)` and **always** check *both* [notes](/library)')).toEqual([
      { type: 'text', text: 'use ' },
      { type: 'code', text: 'dpois(2, 3)' },
      { type: 'text', text: ' and ' },
      { type: 'strong', text: 'always' },
      { type: 'text', text: ' check ' },
      { type: 'em', text: 'both' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'notes', href: '/library' },
    ]);
  });

  it('never reads underscores as italic (R_f, β_i)', () => {
    expect(parseInline('R_f and β_i')).toEqual([{ type: 'text', text: 'R_f and β_i' }]);
  });

  it('keeps HTML as text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ type: 'text', text: '<img src=x onerror=alert(1)>' }]);
  });

  it('reads any link target: it is checked when it is rendered', () => {
    expect(parseInline('[x](javascript:alert(1))')[0]).toEqual({ type: 'link', text: 'x', href: 'javascript:alert(1' });
  });
});
