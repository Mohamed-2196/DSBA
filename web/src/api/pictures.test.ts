import { describe, expect, it } from 'vitest';
import { isPicture, pictureSrc } from './pictures';

describe('pictures', () => {
  it('accepts files of the app and uploaded images only', () => {
    expect(isPicture('brand/newsletter-cover.jpg')).toBe(true);
    expect(isPicture('/demo/news/speech-day.jpg')).toBe(true);
    expect(isPicture('modules/module-ec1002.png')).toBe(true);
    expect(isPicture('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69')).toBe(true);
    expect(isPicture('https://evil.example/pixel.png')).toBe(false);
    expect(isPicture('//evil.example/pixel.png')).toBe(false);
    expect(isPicture('brand/../../secret.png')).toBe(false);
    expect(isPicture('brand/notes.pdf')).toBe(false);
    expect(isPicture('/api/v1/media/0B5F3F8E-1D2C-4C5B-9A6E-2F1D3C4B5A69')).toBe(false);
    expect(isPicture(null)).toBe(false);
  });

  it('loads them from the app or the API, and nothing else', () => {
    expect(pictureSrc('brand/newsletter-cover.jpg')).toBe('/brand/newsletter-cover.jpg');
    expect(pictureSrc('modules/module-ec1002.png')).toBe('/modules/module-ec1002.png');
    expect(pictureSrc('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69')).toBe('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69');
    expect(pictureSrc('https://evil.example/pixel.png')).toBeNull();
    expect(pictureSrc('javascript:alert(1)')).toBeNull();
    expect(pictureSrc(null)).toBeNull();
  });
});
