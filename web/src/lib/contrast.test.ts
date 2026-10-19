import { describe, expect, it } from 'vitest';
import { contrastRatio, over, parseColor } from './contrast';

describe('contrast', () => {
  it('reads the forms browsers compute', () => {
    expect(parseColor('#0a1f44')).toEqual([10, 31, 68, 1]);
    expect(parseColor('rgb(255, 255, 255)')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(parseColor('color(srgb 1 0.5 0 / 0.78)')).toEqual([255, 127.5, 0, 0.78]);
    expect(parseColor('oklab(0.5 0 0)')).toBeNull();
  });

  it('lays a see-through colour over its background, and measures as WCAG does', () => {
    expect(over([0, 0, 0, 0.5], [255, 255, 255, 1])).toEqual([127.5, 127.5, 127.5, 1]);
    expect(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255, 1], [255, 255, 255, 1])).toBe(1);
  });
});
