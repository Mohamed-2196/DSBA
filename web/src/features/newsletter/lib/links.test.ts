import { describe, expect, it } from 'vitest';
import { linkProblem, mailUrl, markupProblem, whatsappUrl } from './links';

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

describe('sharing an issue', () => {
  it('builds WhatsApp and email links with the text encoded', () => {
    expect(whatsappUrl('Issue 01:', 'https://hub.example/newsletter/x')).toBe('https://wa.me/?text=Issue%2001%3A%20https%3A%2F%2Fhub.example%2Fnewsletter%2Fx');
    expect(mailUrl('A & B', 'https://hub.example/x')).toBe('mailto:?subject=A%20%26%20B&body=https%3A%2F%2Fhub.example%2Fx');
  });
});
