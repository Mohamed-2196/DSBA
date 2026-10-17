import { describe, expect, it } from 'vitest';
import { draftOwner, isDraft, restoreDraft } from './threadDraft';

const opts = { knownModule: (id: string) => id === 'mathematics', offeredCategory: (id: string) => /^year-[123]$/.test(id), fallbackCategory: 'year-2', maxTags: 3 };
const draft = (over: Record<string, unknown> = {}) => ({ title: 'MGF of a sum', body: 'details', category: 'year-1', moduleId: 'mathematics', tags: ['exam-prep'], savedAt: 1, ...over });

describe('the draft kept on this device', () => {
  it('only trusts stored JSON that looks like a draft', () => {
    expect(isDraft(draft())).toBe(true);
    expect(isDraft({ title: 1 })).toBe(false);
    expect(isDraft(null)).toBe(false);
  });

  it('belongs to the account that wrote it; a guest draft to whoever signs in', () => {
    expect(draftOwner(draft({ owner: 'sara' }), 'sara')).toBe('mine');
    expect(draftOwner(draft({ owner: 'sara' }), 'ali')).toBe('other');
    expect(draftOwner(draft({ owner: 'sara' }), null)).toBe('other');
    expect(draftOwner(draft({ owner: null }), 'ali')).toBe('mine');
    expect(draftOwner(draft({ title: ' ', body: '' }), 'ali')).toBe('none');
  });

  it('comes back as a form, without what the API doesn’t know', () => {
    expect(restoreDraft(draft({ owner: 'sara' }), 'sara', opts)).toEqual({ title: 'MGF of a sum', body: 'details', category: 'year-1', moduleId: 'mathematics', tags: ['exam-prep'] });
    expect(restoreDraft(draft({ moduleId: 'gone', category: 'year-9', tags: ['a', 'b', 'c', 'd', 5] }), null, opts)).toMatchObject({ moduleId: '', category: 'year-2', tags: ['a', 'b', 'c'] });
    expect(restoreDraft(draft({ owner: 'sara' }), 'ali', opts)).toBeNull();
  });
});
