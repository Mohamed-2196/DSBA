import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../types';
import { CoverThumb, ItemCoverThumb } from './CoverThumb';

const state = vi.hoisted(() => ({ style: 'original', item: undefined as LibraryItem | undefined }));
const useLibraryItem = vi.hoisted(() => vi.fn());
vi.mock('../api', () => ({ useLibraryItem }));
vi.mock('./coverStyle', () => ({ useCoverStyle: () => [state.style] }));

const item: Pick<LibraryItem, 'kind' | 'source' | 'coverUrl'> = {
  kind: 'notes',
  source: 'file',
  coverUrl: '/api/v1/library/items/notes/cover',
};

beforeEach(() => {
  state.style = 'original';
  state.item = undefined;
  useLibraryItem.mockReset().mockImplementation(() => ({ data: state.item }));
});

describe('file covers in lists', () => {
  it('shows the actual page when a file has a cover, including small table cells', () => {
    const html = renderToStaticMarkup(createElement(CoverThumb, { item, size: 'sm' }));
    expect(html).toContain('data-cover="page"');
    expect(html).toContain(`src="${item.coverUrl}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('<svg');
  });

  it('keeps the kind-specific document when no cover is available', () => {
    const html = renderToStaticMarkup(createElement(CoverThumb, { item: { ...item, coverUrl: null }, size: 'md' }));
    expect(html).toContain('data-cover="drawn"');
    expect(html).toContain('ui-doc--note');
    expect(html).not.toContain('<img');
  });

  it('respects the student’s styled-cover preference', () => {
    state.style = 'styled';
    const html = renderToStaticMarkup(createElement(CoverThumb, { item, size: 'lg' }));
    expect(html).toContain('data-cover="drawn"');
    expect(html).not.toContain('<img');
  });

  it('looks up a recently opened file’s current cover by its id', () => {
    state.item = { ...item, id: 'notes' } as LibraryItem;
    const html = renderToStaticMarkup(createElement(ItemCoverThumb, { id: 'notes' }));
    expect(useLibraryItem).toHaveBeenCalledWith('notes');
    expect(html).toContain(`src="${item.coverUrl}"`);
  });

  it('keeps a paper fallback while its current item is unavailable', () => {
    const html = renderToStaticMarkup(createElement(ItemCoverThumb, { id: 'paper', kind: 'past-paper' }));
    expect(html).toContain('data-cover="drawn"');
    expect(html).toContain('ui-doc--paper');
  });
});
import { createElement } from 'react';
