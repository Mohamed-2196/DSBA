import { describe, expect, it } from 'vitest';
import { normalizeCode } from './codes';

describe('normalizeCode', () => {
  it('keeps the digits of a 6-digit code, however it was pasted', () => {
    expect(normalizeCode(' 123 456 ', 'digits')).toBe('123456');
    expect(normalizeCode('Your code is 123-456.', 'digits')).toBe('123456');
    expect(normalizeCode('1234567', 'digits')).toBe('123456');
  });

  it('takes a long code in any case, with or without the dash (D4)', () => {
    expect(normalizeCode('abcde-fgh23', 'long')).toBe('ABCDEFGH23');
    expect(normalizeCode('ABCDE FGH23', 'long')).toBe('ABCDEFGH23');
    expect(normalizeCode('abcdefgh23xyz', 'long')).toBe('ABCDEFGH23');
  });
});
