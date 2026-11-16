import { describe, expect, it } from 'vitest';
import { dialogDescription } from './signInCopy';

describe('dialogDescription', () => {
  it('offers two ways back in on the forgot step when Google sign-in is on', () => {
    expect(dialogDescription('forgot', true)).toBe('There are two ways back in.');
  });

  it('names the one way back in on the forgot step when Google sign-in is off', () => {
    expect(dialogDescription('forgot', false)).toBe('An admin can get you back in.');
  });

  it('mentions Google on the sign-in step only when it is on', () => {
    expect(dialogDescription('sign-in', true)).toBe('Continue with Google, or use your email address and password.');
    expect(dialogDescription('sign-in', false)).toBe('Use your email address and password.');
  });

  it('keeps the sign-up and profile lines whether Google is on or off', () => {
    for (const google of [true, false]) {
      expect(dialogDescription('sign-up', google)).toBe(
        'Reading is open to everyone. An account lets you post, upload and keep your own things.',
      );
      expect(dialogDescription('profile', google)).toBe(
        'This is how classmates see you on the forum and in the library.',
      );
    }
  });
});
