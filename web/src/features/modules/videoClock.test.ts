import { describe, expect, it } from 'vitest';
import { timeFrom, withClock } from './videoClock';

describe('the video clock', () => {
  it('reads the time from the player’s messages, and from YouTube only', () => {
    const msg = JSON.stringify({ event: 'infoDelivery', info: { currentTime: 245.7, playerState: 1 } });
    expect(timeFrom('https://www.youtube.com', msg)).toBe(245.7);
    expect(timeFrom('https://www.youtube-nocookie.com', { info: { currentTime: 3 } })).toBe(3);
    expect(timeFrom('https://evil.example', msg)).toBeNull();
    expect(timeFrom('https://www.youtube.com', '{"event":"onReady"}')).toBeNull();
    expect(timeFrom('https://www.youtube.com', 'not json')).toBeNull();
    expect(timeFrom('https://www.youtube.com', { info: { currentTime: -1 } })).toBeNull();
  });

  it('turns the player’s messages on, and starts where asked', () => {
    const src = withClock('https://www.youtube.com/embed/abc?autoplay=1', 'http://localhost:5173', 125.4);
    const u = new URL(src);
    expect(u.searchParams.get('enablejsapi')).toBe('1');
    expect(u.searchParams.get('origin')).toBe('http://localhost:5173');
    expect(u.searchParams.get('start')).toBe('125');
    expect(withClock('https://bbb.example/playback/1', 'http://x')).toBe('https://bbb.example/playback/1');
  });

  it('starts a class recording at a time with BigBlueButton’s ?t=', () => {
    const rec = 'https://vc.bibf.com/playback/presentation/2.3/abc-1676264200087';
    expect(withClock(rec, 'http://x', 760)).toBe(`${rec}?t=12m40s`);
    expect(withClock(rec, 'http://x', null)).toBe(rec);
    expect(withClock('https://example.com/other', 'http://x', 60)).toBe('https://example.com/other');
  });
});
