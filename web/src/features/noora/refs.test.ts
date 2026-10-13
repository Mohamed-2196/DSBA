import { describe, expect, it } from 'vitest';
import { messageAsText, refKind } from './refs';

describe('refKind', () => {
  it('tells what a link opens', () => {
    expect(refKind('/modules/st2133?tab=lessons&chapter=1&video=0')).toBe('lesson');
    expect(refKind('/modules/st2133?tab=files')).toBe('files');
    expect(refKind('/modules/st2133')).toBe('module');
    expect(refKind('/calendar?event=e1')).toBe('calendar');
    expect(refKind('/library?module=st2133')).toBe('library');
    expect(refKind('/forum')).toBe('page');
  });
});

describe('messageAsText', () => {
  it('copies what she said, the maths in words and where to look', () => {
    const text = messageAsText(
      {
        text: 'The MGF of the Poisson distribution:',
        formula: { say: 'M of t equals e to the lambda times e to the t minus 1', line: [] },
        refs: [
          { code: 'ST2133', label: 'Chapter 2 · Random variables', to: '/modules/st2133?tab=lessons&chapter=1&video=0' },
          { code: 'Library', label: 'Library notes', to: '/library' },
        ],
      },
      (to) => `https://hub.example.com${to}`,
    );
    expect(text).toBe(
      [
        'The MGF of the Poisson distribution:',
        'M of t equals e to the lambda times e to the t minus 1',
        '',
        'Where to look:',
        'ST2133 Chapter 2 · Random variables: https://hub.example.com/modules/st2133?tab=lessons&chapter=1&video=0',
        'Library notes: https://hub.example.com/library',
      ].join('\n'),
    );
  });

  it('is just the text when there is nothing else', () => {
    expect(messageAsText({ text: 'Any time!', refs: [] }, (to) => to)).toBe('Any time!');
  });
});
