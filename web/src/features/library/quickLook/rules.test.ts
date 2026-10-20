import { describe, expect, it } from 'vitest';
import { ownsSpace, placeOf, stepFrom } from './rules';

describe('ownsSpace', () => {
  it('leaves Space to fields, editable text and the controls it presses', () => {
    expect(ownsSpace({ tag: 'INPUT' })).toBe(true);
    expect(ownsSpace({ tag: 'textarea' })).toBe(true);
    expect(ownsSpace({ tag: 'BUTTON' })).toBe(true);
    expect(ownsSpace({ tag: 'div', editable: true })).toBe(true);
    expect(ownsSpace({ tag: 'div', role: 'combobox' })).toBe(true);
    expect(ownsSpace({ tag: 'span', role: 'switch' })).toBe(true);
  });

  it('takes it on a link, the page, or anything else', () => {
    expect(ownsSpace({ tag: 'A' })).toBe(false);
    expect(ownsSpace({ tag: 'BODY' })).toBe(false);
    expect(ownsSpace({ tag: 'article', role: null })).toBe(false);
  });
});

describe('stepFrom', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('moves to the neighbours and stops at the ends', () => {
    expect(stepFrom(items, 'b', 1)?.id).toBe('c');
    expect(stepFrom(items, 'b', -1)?.id).toBe('a');
    expect(stepFrom(items, 'c', 1)).toBeNull();
    expect(stepFrom(items, 'a', -1)).toBeNull();
    expect(stepFrom(items, 'gone', 1)).toBeNull();
  });
});

describe('placeOf', () => {
  it('says where the file is in the list', () => {
    expect(placeOf([{ id: 'a' }, { id: 'b' }], 'b')).toBe('2 of 2');
    expect(placeOf([{ id: 'a' }], 'x')).toBeNull();
  });
});
