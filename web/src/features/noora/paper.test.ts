import { describe, expect, it } from 'vitest';
import { questionNumber } from './paper';

describe('questionNumber', () => {
  it('keeps the number as the paper prints it', () => {
    expect(questionNumber('2(b)')).toBe('2(b)');
    expect(questionNumber('3(a)(ii)')).toBe('3(a)(ii)');
    expect(questionNumber('12')).toBe('12');
  });

  it('drops spaces and a leading Q', () => {
    expect(questionNumber(' Q 2 (b) ')).toBe('2(b)');
    expect(questionNumber('Question 4')).toBe('4');
    expect(questionNumber('q.1a')).toBe('1a');
  });

  it('refuses what isn’t a number', () => {
    expect(questionNumber('')).toBeNull();
    expect(questionNumber('Q')).toBeNull();
    expect(questionNumber('<b>')).toBeNull();
    expect(questionNumber('(a)')).toBeNull();
    expect(questionNumber('1'.repeat(17))).toBeNull();
  });
});
