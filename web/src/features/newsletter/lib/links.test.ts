import { describe, expect, it } from 'vitest';
import { isIssuePicture, linkProblem, mailUrl, markupProblem, safeImageSrc, whatsappUrl } from './links';

describe('linkProblem: what an issue may link to (as the API decides)', () => {
  it.each(['/calendar', '/forum/new?title=MGF%20help', '/library?upload=1#top', 'https://my.london.ac.uk/group/student', 'HTTPS://BIBF.com', 'mailto:reps@example.com'])(
    'accepts %s',
    (href) => {
      expect(linkProblem(href)).toBeNull();
    },
  );

  it.each([
    ['', /Add a link/],
    ['http://bibf.com', /https:\/\//],
    ['//evil.example/signin', /one slash/],
    ['/\\evil.example', /backslashes/],
    ['/\t/evil.example', /spaces/],
    ['https://user:pass@example.com', /user name/],
    ['javascript:alert(1)', /page of the Hub/],
    ['data:text/html,x', /page of the Hub/],
    ['mailto:', /email address/],
    ['calendar', /page of the Hub/],
    [`https://example.com/${'a'.repeat(2000)}`, /shorter/],
  ])('refuses %j', (href, why) => {
    expect(linkProblem(href)).toMatch(why);
  });
});

describe('markupProblem: links inside copy', () => {
  it('passes copy whose links are fine, or that has none', () => {
    expect(markupProblem('Plain text with **bold** and ==a mark==.')).toBeNull();
    expect(markupProblem('See [the calendar](/calendar) and [the portal](https://my.london.ac.uk).')).toBeNull();
  });

  it('names the first link the API would refuse', () => {
    expect(markupProblem('Read [this](http://example.com) and [that](/x).')).toMatch(/^The link “http:\/\/example.com” won’t work/);
    expect(markupProblem('An [empty]() link.')).toMatch(/^A link has no address/);
  });
});

describe('pictures', () => {
  it('accepts files of the app and uploaded images only', () => {
    expect(isIssuePicture('brand/newsletter-cover.jpg')).toBe(true);
    expect(isIssuePicture('/demo/news/speech-day.jpg')).toBe(true);
    expect(isIssuePicture('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69')).toBe(true);
    expect(isIssuePicture('https://evil.example/pixel.png')).toBe(false);
    expect(isIssuePicture('//evil.example/pixel.png')).toBe(false);
    expect(isIssuePicture('brand/../../secret.png')).toBe(false);
    expect(isIssuePicture('brand/notes.pdf')).toBe(false);
    expect(isIssuePicture('/api/v1/media/0B5F3F8E-1D2C-4C5B-9A6E-2F1D3C4B5A69')).toBe(false);
  });

  it('loads them from the app or the API, and nothing else', () => {
    expect(safeImageSrc('brand/newsletter-cover.jpg')).toBe('/brand/newsletter-cover.jpg');
    expect(safeImageSrc('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69')).toBe('/api/v1/media/0b5f3f8e-1d2c-4c5b-9a6e-2f1d3c4b5a69');
    expect(safeImageSrc('https://evil.example/pixel.png')).toBeNull();
    expect(safeImageSrc(null)).toBeNull();
  });
});

describe('sharing an issue', () => {
  it('builds WhatsApp and email links with the text encoded', () => {
    expect(whatsappUrl('Issue 01:', 'https://hub.example/newsletter/x')).toBe('https://wa.me/?text=Issue%2001%3A%20https%3A%2F%2Fhub.example%2Fnewsletter%2Fx');
    expect(mailUrl('A & B', 'https://hub.example/x')).toBe('mailto:?subject=A%20%26%20B&body=https%3A%2F%2Fhub.example%2Fx');
  });
});
