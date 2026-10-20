import { describe, expect, it } from 'vitest';
import { anchorKey, bandOf, findAnchor } from './anchor';

describe('anchorKey', () => {
  it('keeps letters and digits only, lower case, as the API does', () => {
    expect(anchorKey('3. (a) Define the PRICE  elasticity')).toBe('3adefinethepriceelasticity');
    expect(anchorKey('the ﬁrst x²')).toBe('thefirstx2'); // ligatures and superscripts
  });
});

describe('findAnchor', () => {
  const items = ['SECTION A', '1. Define the price', ' elasticity of demand and', 'explain what determines it.', '2.'];

  it('finds the items that hold the start of the anchor, across items and spacing', () => {
    expect(findAnchor(items, '1. Define the price elasticity of demand and explain')).toEqual({ first: 1, last: 3 });
    expect(findAnchor(items, '1.Define  the price elasticity')).toEqual({ first: 1, last: 2 });
  });

  it('is null when the page has no such words, or the anchor is too short to find one place', () => {
    expect(findAnchor(items, '3. Discuss the money supply')).toBeNull();
    expect(findAnchor(items, '1.')).toBeNull();
    expect(findAnchor([], '1. Define the price elasticity')).toBeNull();
  });
});

describe('bandOf', () => {
  it('spans the lines, padded and kept on the page', () => {
    expect(
      bandOf(
        [
          { top: 0.2, bottom: 0.22 },
          { top: 0.23, bottom: 0.25 },
        ],
        0.01,
      ),
    ).toEqual({ top: 0.19, bottom: 0.26 });
    expect(bandOf([{ top: 0, bottom: 1 }], 0.01)).toEqual({ top: 0, bottom: 1 });
    expect(bandOf([])).toBeNull();
  });
});
