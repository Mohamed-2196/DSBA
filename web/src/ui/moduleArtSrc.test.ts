import { describe, expect, it } from 'vitest';
import { moduleArtSrc } from './moduleArtSrc';

describe('moduleArtSrc', () => {
  it('points a module with an illustration at its file under public/modules', () => {
    expect(moduleArtSrc('econometrics')).toBe(`${import.meta.env.BASE_URL}modules/module-ec2020.png`);
  });

  it('is null for a module without one, or no module', () => {
    expect(moduleArtSrc('information-systems')).toBeNull();
    expect(moduleArtSrc('machine-learning')).toBeNull();
    expect(moduleArtSrc(null)).toBeNull();
    expect(moduleArtSrc('')).toBeNull();
    expect(moduleArtSrc('constructor')).toBeNull();
  });
});
