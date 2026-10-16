import { describe, expect, it } from 'vitest';
import { moduleArtSrc } from './moduleArtSrc';

describe('moduleArtSrc', () => {
  it('points a module with an illustration at its file under public/modules', () => {
    expect(moduleArtSrc('econometrics')).toBe(`${import.meta.env.BASE_URL}modules/module-ec2020.png`);
    expect(moduleArtSrc('information-systems')).toBe(`${import.meta.env.BASE_URL}modules/module-is2184.png`);
    expect(moduleArtSrc('machine-learning')).toBe(`${import.meta.env.BASE_URL}modules/module-machine-learning.png`);
  });

  it('is null for a module without one, or no module', () => {
    expect(moduleArtSrc('abstract-maths')).toBeNull();
    expect(moduleArtSrc(null)).toBeNull();
    expect(moduleArtSrc('')).toBeNull();
    expect(moduleArtSrc('constructor')).toBeNull();
  });

  it('returns custom artUrl when provided', () => {
    expect(moduleArtSrc('econometrics', '/api/v1/media/123')).toBe('/api/v1/media/123');
    expect(moduleArtSrc('abstract-maths', '/api/v1/media/456')).toBe('/api/v1/media/456');
  });
});
