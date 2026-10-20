import { describe, expect, it } from 'vitest';
import { readResetToken } from './resetToken';

describe('readResetToken', () => {
  it('reads the token from the fragment', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz_0123456789-AB';
    expect(readResetToken(`#token=${token}`)).toBe(token);
  });
  it('refuses a missing, short or odd token', () => {
    expect(readResetToken('')).toBeNull();
    expect(readResetToken('#token=short')).toBeNull();
    expect(readResetToken('#token=has spaces and more than twenty')).toBeNull();
  });
});
