import { describe, expect, it } from 'vitest';
import { newItemId } from './doc';

/** The API's pattern for an item's id. */
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('newItemId', () => {
  it('is the prefix and a random end the API accepts', () => {
    const id = newItemId('step', []);
    expect(id).toMatch(/^step-[a-z0-9]{8}$/);
    expect(id).toMatch(ITEM_ID);
  });

  it('never gives an id twice, so a removed item’s id isn’t handed out again', () => {
    const ids = Array.from({ length: 200 }, () => newItemId('subject', ['subject-1', 'subject-2']));
    expect(new Set(ids).size).toBe(200);
  });

  it('never gives one of the ids there are', () => {
    const ends = ['aaaaaaaa', 'aaaaaaaa', 'bbbbbbbb'];
    expect(newItemId('step', ['step-aaaaaaaa'], () => ends.shift() ?? 'cccccccc')).toBe('step-bbbbbbbb');
  });
});
