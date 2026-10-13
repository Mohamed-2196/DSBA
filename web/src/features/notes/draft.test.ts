import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../../api/types';
import { asDraft, draftIds, dropDraft, emptyDoc, isBlank, noteLabel, openNote, plainExcerpt, readDraft, sameDoc, writeDraft, type NoteDoc } from './draft';

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'Moments',
  body: 'E[X]',
  excerpt: 'E[X]',
  moduleId: null,
  chapter: null,
  video: null,
  version: 3,
  createdAt: '2026-10-13T10:00:00Z',
  updatedAt: '2026-10-13T10:00:00Z',
  ...over,
});
const doc = (over: Partial<NoteDoc> = {}): NoteDoc => ({ title: 'Moments', body: 'E[X]', moduleId: null, chapter: null, video: null, ...over });

describe('openNote', () => {
  it('opens the server note when there is no copy here, or the copy says the same', () => {
    expect(openNote(note(), null)).toEqual({ doc: doc(), base: 3, theirs: null });
    expect(openNote(note(), { doc: doc(), base: 1, at: 0 })).toEqual({ doc: doc(), base: 3, theirs: null });
  });

  it('opens the copy written over the server version, to be sent', () => {
    expect(openNote(note(), { doc: doc({ body: 'Mine' }), base: 3, at: 0 })).toEqual({ doc: doc({ body: 'Mine' }), base: 3, theirs: null });
  });

  it('offers a choice when the note was saved elsewhere since the copy was written', () => {
    const opened = openNote(note(), { doc: doc({ body: 'Mine' }), base: 2, at: 0 });
    expect(opened.doc.body).toBe('Mine');
    expect(opened.base).toBe(2);
    expect(opened.theirs?.version).toBe(3);
  });
});

describe('asDraft', () => {
  it('reads a stored draft and refuses anything else', () => {
    expect(asDraft({ doc: doc(), base: 2, at: 5 })).toEqual({ doc: doc(), base: 2, at: 5 });
    expect(asDraft({ doc: doc(), base: null, at: 5 })?.base).toBeNull();
    expect(asDraft(null)).toBeNull();
    expect(asDraft({ doc: { title: 1 }, base: 2, at: 5 })).toBeNull();
    expect(asDraft({ doc: doc({ chapter: 1.5 }), base: 2, at: 5 })).toBeNull();
    expect(asDraft({ doc: doc(), base: '2', at: 5 })).toBeNull();
  });
});

describe('docs', () => {
  it('compares every field', () => {
    expect(sameDoc(doc(), doc())).toBe(true);
    expect(sameDoc(doc(), doc({ video: 0, chapter: 0 }))).toBe(false);
    expect(sameDoc(doc(), null)).toBe(false);
  });

  it('starts a new note where it was asked for, keeping a lesson only with its module', () => {
    expect(emptyDoc({ moduleId: 'm', chapter: 1, video: 2 })).toEqual(doc({ title: '', body: '', moduleId: 'm', chapter: 1, video: 2 }));
    expect(emptyDoc({ chapter: 1, video: 2 })).toEqual(doc({ title: '', body: '' }));
    expect(emptyDoc({ moduleId: 'm', video: 2 }).video).toBeNull();
    expect(isBlank(emptyDoc())).toBe(true);
    expect(isBlank(doc({ title: ' ', body: 'x' }))).toBe(false);
  });
});

describe('labels', () => {
  it('names a note by its title, else its first line, else "Untitled note"', () => {
    expect(noteLabel({ title: '  Week 3 ', body: 'x' })).toBe('Week 3');
    expect(noteLabel({ title: '', body: '\n\n## **Bayes** rule\nmore' })).toBe('Bayes rule');
    expect(noteLabel({ title: '', excerpt: '- first point' })).toBe('first point');
    expect(noteLabel({ title: '', body: '   ' })).toBe('Untitled note');
    expect(noteLabel({ title: '', body: 'a'.repeat(100) })).toHaveLength(80);
  });

  it('shows the body as one plain line', () => {
    expect(plainExcerpt('**Bold** and `code`\n\n- [a link](https://example.com)')).toBe('Bold and code - a link');
    expect(plainExcerpt('```r\nx <- 1\n```\nafter')).toBe('after');
    expect(plainExcerpt('x'.repeat(200), 10)).toBe('xxxxxxxxx…');
  });
});

describe('the copy on this device', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    const localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
    vi.stubGlobal('window', { localStorage, dispatchEvent: () => true, addEventListener: () => undefined, removeEventListener: () => undefined });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is written, read, listed and dropped under personal keys', () => {
    writeDraft('n1', doc({ body: 'Mine' }), 3);
    writeDraft(null, doc({ title: 'New' }), null);
    store.set('hub.mine.search', '[]');
    expect(readDraft('n1')).toMatchObject({ doc: doc({ body: 'Mine' }), base: 3 });
    expect(readDraft(null)?.doc.title).toBe('New');
    expect(draftIds().sort()).toEqual(['n1', 'new']);
    expect([...store.keys()].every((k) => k.startsWith('hub.mine.'))).toBe(true);
    dropDraft('n1');
    expect(readDraft('n1')).toBeNull();
  });

  it('is ignored when storage fails', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('full');
        },
        removeItem: () => undefined,
      },
      dispatchEvent: () => true,
    });
    expect(() => writeDraft('n1', doc(), 1)).not.toThrow();
    expect(readDraft('n1')).toBeNull();
    expect(draftIds()).toEqual([]);
  });
});
