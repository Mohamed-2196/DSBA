import { describe, expect, it } from 'vitest';
import type { IssueSection } from '../../../api/types';
import { INLINE_RE, countWords, issueNo, listNames, plainText, readMinutes, sectionLabel, sectionText, slugify } from './text';

const story: IssueSection = {
  id: 'cfa',
  title: 'BIBF is taking participants',
  label: 'CFA Research Challenge',
  blocks: [
    { type: 'p', text: 'The **challenge** opens in [October](/calendar).', lead: true },
    { type: 'list', items: ['Form a team', 'Pick a *listed* company'] },
    { type: 'cta', label: 'Open the calendar', to: '/calendar' },
  ],
  after: [{ type: 'signoff', text: 'The editors' }],
  figure: { src: 'demo/news/cfa.jpg', width: 10, height: 10, alt: '', caption: 'A poster.' },
  aside: { type: 'stats', title: 'In numbers', items: [{ value: '16', label: 'modules' }], foot: 'So far.', wide: false },
};

describe('the inline markup', () => {
  it('reads as plain text', () => {
    expect(plainText('**Bold**, *italic*, ==marked== and [a link](https://x.example).')).toBe('Bold, italic, marked and a link.');
  });

  it('splits into runs and tokens for the renderer', () => {
    expect('a **b** c [d](/e) f'.split(INLINE_RE)).toEqual(['a ', '**b**', ' c ', '[d](/e)', ' f']);
  });
});

describe('read time', () => {
  it('counts the words of a section’s copy, not its links or buttons', () => {
    expect(sectionText(story)).toBe('CFA Research Challenge BIBF is taking participants A poster. The challenge opens in October. Form a team Pick a listed company The editors In numbers 16 modules So far.');
    expect(countWords('Don’t panic: it’s 2.5 pages.')).toBe(5);
  });

  it('rounds to whole minutes, at least one, live lists included', () => {
    expect(readMinutes({ title: 'x', sections: [] })).toBe(1);
    expect(readMinutes({ title: 'x', sections: [{ ...story, estWords: 460 }] })).toBe(2);
  });
});

describe('names and addresses', () => {
  it('labels a section by its label, or its headline', () => {
    expect(sectionLabel(story)).toBe('CFA Research Challenge');
    expect(sectionLabel({ ...story, label: null })).toBe('BIBF is taking participants');
    expect(sectionLabel({ ...story, label: '  ' })).toBe('BIBF is taking participants');
  });

  it('makes addresses from titles', () => {
    expect(slugify('Launch edition!')).toBe('launch-edition');
    expect(slugify('Café & Crème: 2026/27')).toBe('cafe-creme-2026-27');
    expect(slugify('أخبار')).toBe('');
    expect(slugify('a'.repeat(100)).length).toBe(80);
    expect(slugify('word '.repeat(20), 12)).toBe('word-word-wo');
  });

  it('writes issue numbers and lists of names', () => {
    expect([0, 1, 12].map(issueNo)).toEqual(['00', '01', '12']);
    expect(listNames(['Hawra T.'])).toBe('Hawra T.');
    expect(listNames(['Hawra T.', 'Zainab K.', 'Hussain M.'])).toBe('Hawra T., Zainab K. and Hussain M.');
  });
});
