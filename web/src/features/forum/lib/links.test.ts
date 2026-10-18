import { describe, expect, it } from 'vitest';
import { mediaSrc, safeLink } from './links';

const kind = (href: string) => safeLink(href)?.kind ?? null;
const MEDIA = '/api/v1/media/7511c4f7-ffbf-4f8e-8500-93334507e674';

describe('safeLink: links in posts', () => {
  it('keeps paths inside the app, with their query and fragment', () => {
    expect(safeLink('/forum/how-do-i-find-the-mgf')).toEqual({ kind: 'internal', to: '/forum/how-do-i-find-the-mgf' });
    expect(safeLink(' /forum/x?order=oldest#reply-2 ')).toEqual({
      kind: 'internal',
      to: '/forum/x?order=oldest#reply-2',
    });
  });

  it.each([
    ['protocol-relative', '//evil.example/signin'],
    ['backslash host', '/\\evil.example/signin'],
    ['tab before the host', '/\t/evil.example'],
    ['newline before the host', '/\n/evil.example'],
    ['a space', '/forum x'],
    ['a right-to-left override', '/forum/\u202eevil'],
    ['a zero-width space', '/forum/\u200bx'],
    ['a soft hyphen', '/forum/\u00adx'],
    ['a backslash later on', '/forum\\x'],
  ])('never makes a link of a path with %s', (_, href) => {
    expect(kind(href)).toBeNull();
  });

  it('keeps http(s) links and says where they go', () => {
    expect(safeLink('https://en.wikipedia.org/wiki/Gamma_distribution')).toEqual({
      kind: 'external',
      href: 'https://en.wikipedia.org/wiki/Gamma_distribution',
      host: 'en.wikipedia.org',
    });
    expect(safeLink('http://www.example.com/a')).toMatchObject({ kind: 'external', host: 'example.com' });
  });

  it('keeps mailto links', () => {
    expect(safeLink('mailto:rep@example.com')).toEqual({ kind: 'mailto', href: 'mailto:rep@example.com' });
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'file:///etc/passwd',
    'ftp://example.com',
    'page.html',
    '../x',
    '',
  ])('leaves %s as plain text', (href) => {
    expect(kind(href)).toBeNull();
  });

  it('turns down links longer than any real one', () => {
    expect(kind(`https://example.com/${'a'.repeat(2000)}`)).toBeNull();
  });
});

describe('mediaSrc: pictures in posts', () => {
  it('loads only pictures the API serves', () => {
    expect(mediaSrc(MEDIA)).toBe(MEDIA);
    expect(mediaSrc(MEDIA.toUpperCase())).toBeNull();
    expect(mediaSrc(`${MEDIA}?x=1`)).toBeNull();
    expect(mediaSrc('/api/v1/media/../admin')).toBeNull();
    expect(mediaSrc('https://evil.example/x.png')).toBeNull();
    expect(mediaSrc('/demo/forum/a.jpg')).toBeNull();
    expect(mediaSrc(null)).toBeNull();
  });
});
