import { describe, expect, it } from 'vitest';
import { shortVersion } from './version';

describe('shortVersion', () => {
  it('shows a commit by its first seven characters, as GitHub does', () => {
    expect(shortVersion('1147bd1d0a4f2c3e5b6a7980c1d2e3f405162738')).toBe('1147bd1');
    expect(shortVersion('C25B735')).toBe('c25b735');
  });

  it.each(['dev', 'v1.2.3', 'c25b73', ''])('leaves %j as it is', (version) => {
    expect(shortVersion(version)).toBe(version);
  });
});
