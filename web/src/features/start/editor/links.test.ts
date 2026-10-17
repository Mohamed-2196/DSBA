import { describe, expect, it } from 'vitest';
import { linkOfKind } from './links';

describe('linkOfKind', () => {
  it('keeps the link text when the kind changes', () => {
    const page = linkOfKind('page', { kind: 'web', href: 'https://example.com', label: 'Your modules' });
    expect(page).toEqual({ kind: 'page', to: '/', label: 'Your modules', feature: null });
    expect(linkOfKind('date', page)).toEqual({ kind: 'date', title: '', type: 'deadline', label: 'Your modules' });
  });

  it('starts empty from nothing, and the install button has no text', () => {
    expect(linkOfKind('site', null)).toEqual({ kind: 'site', link: 'uolPortal', label: '' });
    expect(linkOfKind('install', { kind: 'web', href: '', label: 'x' })).toEqual({ kind: 'install' });
    expect(linkOfKind('web', { kind: 'install' })).toEqual({ kind: 'web', href: '', label: '' });
  });
});
