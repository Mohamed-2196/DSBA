import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InkSheet, Note } from '../../api/types';
import {
  asDraft,
  docFromText,
  docOf,
  draftIds,
  dropDraft,
  lessonLabel,
  noteLabel,
  openInk,
  openNote,
  plainExcerpt,
  readDraft,
  readInkDraft,
  sameDoc,
  writeDraft,
  writeInkDraft,
  type InkDraft,
  type NoteDoc,
} from './draft';

const sampleNote = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  notebookId: 'book-1',
  title: 'Moments',
  doc: docFromText('E[X] is the mean'),
  text: 'E[X] is the mean',
  excerpt: 'E[X] is the mean',
  paper: 'lined',
  sheets: 1,
  moduleId: 'ST2133',
  lessonId: null,
  onPdf: false,
  pdf: null,
  ink: [],
  version: 3,
  createdAt: '2026-10-13T10:00:00Z',
  updatedAt: '2026-10-13T10:00:00Z',
  ...over,
});

const sampleDoc = (over: Partial<NoteDoc> = {}): NoteDoc => ({
  title: 'Moments',
  doc: docFromText('E[X] is the mean'),
  paper: 'lined',
  sheets: 1,
  lessonId: null,
  notebookId: 'book-1',
  ...over,
});

describe('openNote', () => {
  it('opens the server note when there is no copy here, or the copy says the same', () => {
    expect(openNote(sampleNote(), null)).toEqual({ doc: sampleDoc(), base: 3, theirs: null });
    expect(openNote(sampleNote(), { doc: sampleDoc(), base: 1, at: 0 })).toEqual({
      doc: sampleDoc(),
      base: 3,
      theirs: null,
    });
  });

  it('opens the copy written over the server version, to be sent', () => {
    const mine = sampleDoc({ title: 'Mine' });
    expect(openNote(sampleNote(), { doc: mine, base: 3, at: 0 })).toEqual({ doc: mine, base: 3, theirs: null });
  });

  it('offers a choice when the note was saved elsewhere since the copy was written', () => {
    const mine = sampleDoc({ title: 'Mine' });
    const opened = openNote(sampleNote(), { doc: mine, base: 2, at: 0 });
    expect(opened.doc.title).toBe('Mine');
    expect(opened.base).toBe(2);
    expect(opened.theirs?.version).toBe(3);
  });
});

describe('asDraft', () => {
  it('reads a stored draft and refuses anything else', () => {
    expect(asDraft({ doc: sampleDoc(), base: 2, at: 5 })).toEqual({ doc: sampleDoc(), base: 2, at: 5 });
    expect(asDraft({ doc: sampleDoc(), base: null, at: 5 })).toBeNull();
    expect(asDraft(null)).toBeNull();
    expect(asDraft({ doc: { title: 1 }, base: 2, at: 5 })).toBeNull();
    expect(asDraft({ doc: { ...sampleDoc(), lessonId: 3 }, base: 2, at: 5 })).toBeNull();
    expect(asDraft({ doc: sampleDoc(), base: '2', at: 5 })).toBeNull();
  });
});

describe('docs', () => {
  it('compares every field', () => {
    expect(sameDoc(sampleDoc(), sampleDoc())).toBe(true);
    expect(sameDoc(sampleDoc(), sampleDoc({ lessonId: 'abc' }))).toBe(false);
    expect(sameDoc(sampleDoc(), sampleDoc({ paper: 'grid' }))).toBe(false);
    expect(sameDoc(sampleDoc(), sampleDoc({ sheets: 2 }))).toBe(false);
    expect(sameDoc(sampleDoc(), null)).toBe(false);
  });

  it('converts plain text into rich doc paragraphs', () => {
    const d = docFromText('Line 1\n\nLine 2');
    expect(d.type).toBe('doc');
    expect(d.content).toHaveLength(3);
  });

  it('extracts noteDoc from note', () => {
    const n = sampleNote();
    expect(docOf(n)).toEqual(sampleDoc());
  });
});

describe('labels', () => {
  it('names a note by its title, else its first line, else "Untitled note"', () => {
    expect(noteLabel({ title: '  Week 3 ', text: 'x' })).toBe('Week 3');
    expect(noteLabel({ title: '', text: '\n\nBayes rule\nmore' })).toBe('Bayes rule');
    expect(noteLabel({ title: '', excerpt: '- first point' })).toBe('- first point');
    expect(noteLabel({ title: '', text: '   ' })).toBe('Untitled note');
    expect(noteLabel({ title: '', text: 'a'.repeat(100) })).toHaveLength(80);
  });

  it('formats lesson labels', () => {
    expect(lessonLabel({ c: 1, v: 0 })).toBe('Chapter 2, video 1');
    expect(lessonLabel(null)).toBe('A lesson');
  });

  it('shows the body as one plain line', () => {
    expect(plainExcerpt('Formula $E[X]$\n\nSecond line')).toBe('Formula E[X] Second line');
    expect(plainExcerpt('x'.repeat(200), 10)).toBe('xxxxxxxxx…');
  });
});

describe('ink helpers', () => {
  it('merges server ink and local ink drafts', () => {
    const server: InkSheet[] = [{ sheet: 0, version: 1, strokes: [] }];
    const draft: InkDraft = {
      '0': {
        strokes: [{ id: 's1', tool: 'pen', color: '#000000', width: 2, points: [0, 0, 0.5] }],
        base: 1,
      },
      '1': {
        strokes: [{ id: 's2', tool: 'pen', color: '#000000', width: 2, points: [10, 10, 0.5] }],
        base: 0,
      },
    };
    const res = openInk(server, draft);
    expect(res.sheets.size).toBe(2);
    expect(res.pending.has(0)).toBe(true);
    expect(res.pending.has(1)).toBe(true);
    expect(res.changed.size).toBe(0);
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
    vi.stubGlobal('window', {
      localStorage,
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is written, read, listed and dropped under personal keys', () => {
    writeDraft('n1', sampleDoc({ title: 'Mine' }), 3);
    writeInkDraft('n1', { '0': { strokes: [], base: 1 } });
    store.set('hub.mine.search', '[]');
    expect(readDraft('n1')).toMatchObject({ doc: sampleDoc({ title: 'Mine' }), base: 3 });
    expect(readInkDraft('n1')).toMatchObject({ '0': { strokes: [], base: 1 } });
    expect(draftIds().sort()).toEqual(['n1']);
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
    expect(() => writeDraft('n1', sampleDoc(), 1)).not.toThrow();
    expect(readDraft('n1')).toBeNull();
    expect(draftIds()).toEqual([]);
  });
});
