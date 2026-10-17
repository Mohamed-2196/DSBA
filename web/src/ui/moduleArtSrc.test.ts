import { describe, expect, it } from 'vitest';
import { moduleArtSrc } from './moduleArtSrc';

describe('moduleArtSrc', () => {
  it('loads a picture of the app from under the app’s base path', () => {
    expect(moduleArtSrc('modules/module-ec2020.png')).toBe(`${import.meta.env.BASE_URL}modules/module-ec2020.png`);
  });

  it('loads an uploaded picture from the API', () => {
    expect(moduleArtSrc('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69')).toBe('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69');
  });

  it('is null without art, or for anything that isn’t a picture of the hub', () => {
    expect(moduleArtSrc(null)).toBeNull();
    expect(moduleArtSrc('')).toBeNull();
    expect(moduleArtSrc('https://tracker.example.com/logo.png')).toBeNull();
    expect(moduleArtSrc('javascript:alert(1)')).toBeNull();
  });
});
