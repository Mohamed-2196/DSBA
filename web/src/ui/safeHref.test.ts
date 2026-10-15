import { describe, expect, it } from 'vitest';
import { isMediaPath, safeHref, safeInternalPath } from './safeHref';

describe('safeHref', () => {
  it('keeps paths inside the app', () => {
    expect(safeHref('/forum/how-do-i-find-the-mgf')).toEqual({ kind: 'internal', to: '/forum/how-do-i-find-the-mgf' });
    expect(safeHref('  /library?q=st2133#top ')).toEqual({ kind: 'internal', to: '/library?q=st2133#top' });
    expect(safeHref('/')).toEqual({ kind: 'internal', to: '/' });
  });

  it.each(['//evil.example/signin', '/\\evil.example/signin'])('never treats %s as a path of the app', (raw) => {
    expect(safeHref(raw)?.kind).not.toBe('internal');
    expect(safeInternalPath(raw)).toBeNull();
  });

  it('keeps http(s) and mailto links, normalised', () => {
    expect(safeHref('https://example.com/a%20b')).toEqual({ kind: 'external', href: 'https://example.com/a%20b' });
    expect(safeHref('HTTP://Example.com')).toEqual({ kind: 'external', href: 'http://example.com/' });
    expect(safeHref('mailto:rep@example.com')).toEqual({ kind: 'external', href: 'mailto:rep@example.com' });
  });

  it.each(['https://drive.google.com/drive/folders/1abc', 'https://DOCS.google.com/document/d/1abc/edit'])('never sends anyone to Google Drive: %s', (raw) => {
    expect(safeHref(raw)).toBeNull();
  });

  it.each(['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', 'forum/relative', '', null, undefined])(
    'turns %s into plain text',
    (raw) => {
      expect(safeHref(raw)).toBeNull();
    },
  );

  it('keeps notification targets inside the Hub', () => {
    expect(safeInternalPath('/forum/abc#reply-1')).toBe('/forum/abc#reply-1');
    expect(safeInternalPath('https://example.com/')).toBeNull();
  });

  // Security review SEC-3: browsers drop tabs and newlines inside URLs, so this is really '//evil.example/x'.
  it('refuses a path split by a tab (SEC-3)', () => {
    expect(safeHref('/\t/evil.example/x')).toBeNull();
  });

  it.each([
    ['a newline', '/\n/evil.example/x'],
    ['a carriage return', '/\r/evil.example'],
    ['a space', 'https://example.com/a b'],
    ['a no-break space', '/forum/a\u00a0b'],
    ['a zero-width space', '/\u200b/evil.example'],
    ['a line separator', 'https://example.com/\u2028x'],
    ['a NUL', '/forum\u0000/x'],
    ['DEL', '/forum\u007f'],
    ['a backslash after the host', 'https://example.com\\@evil.example'],
    ['a backslash in a path', '/forum\\x'],
    ['a backslash in a mailto', 'mailto:a\\b@example.com'],
  ])('refuses a link with %s in it', (_, raw) => {
    expect(safeHref(raw)).toBeNull();
  });
});

describe('isMediaPath', () => {
  const id = '0f8c2d6e-3b1a-4c7e-9d2f-5a6b7c8d9e0f';

  it('accepts an uploaded picture exactly as the API writes it', () => {
    expect(isMediaPath(`/api/v1/media/${id}`)).toBe(true);
  });

  it.each([
    `/api/v1/media/${id.toUpperCase()}`,
    `/api/v1/media/${id}/x`,
    `/api/v1/media/${id}?x=1`,
    `https://evil.example/api/v1/media/${id}`,
    `//evil.example/api/v1/media/${id}`,
    '/api/v1/media/------------------------------------',
    `/api/v1/media/${id.slice(1)}`,
    '',
    null,
    undefined,
  ])('refuses %s', (raw) => {
    expect(isMediaPath(raw)).toBe(false);
  });
});
