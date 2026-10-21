import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../api/types';
import { newFileRows } from './fileRows';

let seq = 0;
const item = (over: Partial<LibraryItem>): LibraryItem =>
  ({
    id: `i${++seq}`,
    slug: `s${seq}`,
    source: 'file',
    kind: 'notes',
    title: `File ${seq}`,
    moduleId: 'st2133',
    publishedAt: '2026-10-14T10:00:00Z',
    createdAt: '2026-10-14T10:00:00Z',
    ...over,
  }) as LibraryItem;

describe('newFileRows', () => {
  it('lists single files with their own rows', () => {
    const rows = newFileRows([item({ moduleId: 'a' }), item({ moduleId: 'b' })], null, 6);
    expect(rows.map((r) => r.kind)).toEqual(['file', 'file']);
  });

  it('folds three or more files on one module and day into a batch', () => {
    const batch = [1, 2, 3, 4].map(() => item({ moduleId: 'st2133', publishedAt: '2026-09-01T08:00:00Z' }));
    const rows = newFileRows([item({ moduleId: 'ec2020' }), ...batch], null, 6);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: 'batch', moduleId: 'st2133', count: 4 });
  });

  it('keeps a real cover for a batch, even when its newest file has none', () => {
    const files = [item({ coverUrl: null }), item({ coverUrl: '/covers/notes.webp' }), item({ coverUrl: null })];
    expect(newFileRows(files, null, 6)[0]).toMatchObject({ kind: 'batch', item: files[1] });
  });

  it('keeps a fallback file for a batch without covers', () => {
    const files = [item({ coverUrl: null }), item({ coverUrl: null }), item({ coverUrl: null })];
    expect(newFileRows(files, null, 6)[0]).toMatchObject({ kind: 'batch', item: files[0] });
  });

  it('leaves out links and other modules, and stops at n', () => {
    const rows = newFileRows(
      [
        item({ source: 'link' }),
        item({ moduleId: 'other' }),
        item({ moduleId: 'st2133' }),
        item({ moduleId: null }),
        item({ moduleId: 'st2133', publishedAt: '2026-10-01T00:00:00Z' }),
      ],
      new Set(['st2133']),
      2,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === 'file' && r.item.source === 'file')).toBe(true);
  });
});
