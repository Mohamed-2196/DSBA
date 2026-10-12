import { describe, expect, it } from 'vitest';
import { highlightTerms, rankSimilar, similarQuery, tokenize } from './search';

describe('tokenize', () => {
  it('keeps the words that matter, once, in lower case', () => {
    expect(tokenize('How do I find the MGF of the MGF?')).toEqual(['find', 'mgf']);
  });
  it('keeps Arabic words and their marks, and numbers, not single letters', () => {
    expect(tokenize('هل المكتبة مفتوحة')).toEqual(['هل', 'المكتبة', 'مفتوحة']);
    expect(tokenize('ST2133 2023 Q3(b)')).toEqual(['st2133', '2023', 'q3']);
  });
});

describe('highlightTerms', () => {
  it('marks words of two letters or more', () => {
    expect(highlightTerms('a mgf b 2')).toEqual(['mgf']);
  });
});

describe('similar threads', () => {
  it('asks for any of the longest words', () => {
    expect(similarQuery('How do I find the MGF of a Gamma distribution?')).toBe('"distribution" or "gamma" or "find" or "mgf"');
    expect(similarQuery('Is it to be?')).toBe('');
  });

  it('ranks threads by the words their titles share', () => {
    const threads = [
      { title: 'Library hours', excerpt: 'exams are near', voteCount: 9 },
      { title: 'Calculators allowed in exams', excerpt: '', voteCount: 1 },
      { title: 'Are calculators allowed in the ST2133 exam?', excerpt: 'which models', voteCount: 3 },
    ];
    expect(rankSimilar(threads, 'Are calculators allowed in exams?').map((t) => t.title)).toEqual([
      'Calculators allowed in exams',
      'Are calculators allowed in the ST2133 exam?',
    ]);
    expect(rankSimilar(threads, '??')).toEqual([]);
  });
});
