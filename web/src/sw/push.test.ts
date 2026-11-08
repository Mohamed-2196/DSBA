import { describe, expect, it } from 'vitest';
import { hubPath, parsePush, pickWindow } from './push';

const ORIGIN = 'https://hub.example.com';

describe('parsePush', () => {
  it('reads the API’s message', () => {
    const data = JSON.stringify({
      title: 'Omar replied to your thread “MGF of a Laplace”',
      body: 'Integrate e^{tx} against the density.',
      url: '/forum/mgf#reply-1',
      tag: 'thread-1',
      badge: 3,
    });
    expect(parsePush(data)).toEqual({
      title: 'Omar replied to your thread “MGF of a Laplace”',
      body: 'Integrate e^{tx} against the density.',
      url: '/forum/mgf#reply-1',
      tag: 'thread-1',
      badge: 3,
    });
  });

  it('fills what is missing and drops what is wrong', () => {
    expect(parsePush(JSON.stringify({ title: 'Hi', body: null, url: '//evil.example', badge: -1 }))).toEqual({
      title: 'Hi',
      body: null,
      url: '/',
      tag: 'hub',
      badge: null,
    });
  });

  it('ignores anything that isn’t a message', () => {
    expect(parsePush(null)).toBeNull();
    expect(parsePush('')).toBeNull();
    expect(parsePush('not json')).toBeNull();
    expect(parsePush('[1]')).toBeNull();
    expect(parsePush(JSON.stringify({ body: 'no title' }))).toBeNull();
  });
});

describe('hubPath', () => {
  it('keeps the Hub’s pages only', () => {
    expect(hubPath('/forum/x?y=1#z')).toBe('/forum/x?y=1#z');
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/a b', 3]) {
      expect(hubPath(bad)).toBe('/');
    }
  });
});

describe('pickWindow', () => {
  const w = (url: string) => ({ url });

  it('focuses a window on the page already', () => {
    const on = w(`${ORIGIN}/forum/x`);
    expect(pickWindow([w(`${ORIGIN}/`), on], '/forum/x', ORIGIN)).toEqual({ window: on, navigate: false });
  });

  it('else takes the Hub there in a window it has open', () => {
    const home = w(`${ORIGIN}/`);
    expect(pickWindow([w('https://other.example/'), home], '/forum/x', ORIGIN)).toEqual({
      window: home,
      navigate: true,
    });
  });

  it('else opens a new one', () => {
    expect(pickWindow([w('https://other.example/'), w('not a url')], '/forum/x', ORIGIN)).toBeNull();
  });
});
