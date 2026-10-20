// The lesson's video clock: where the YouTube player is (to stamp a note with the time) and a way to go to a time
// (a stamp tapped in a note). It talks to the embedded player with YouTube's postMessage protocol (the embed loads
// with enablejsapi=1 and this page's origin), without loading YouTube's script: the page says it is listening, the
// player answers with its state and current time while it plays, and commands go back the same way. Class
// recordings (BigBlueButton) have no clock: going to a time loads them again there (withClock).
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { playbackTime } from './topics/time';

export interface VideoClock {
  /** whether the player answers (a YouTube video, loaded) */
  ready: boolean;
  /** the time the video is at, in whole seconds (null before the player answers) */
  now: () => number | null;
  /** go to `seconds` and play */
  seek: (seconds: number) => void;
}

const YOUTUBE = /^https:\/\/(www\.)?youtube(-nocookie)?\.com$/;

/** The current time a message from the player carries, or null for any other message. */
export function timeFrom(origin: string, data: unknown): number | null {
  if (!YOUTUBE.test(origin)) return null;
  let message: unknown = data;
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!message || typeof message !== 'object') return null;
  const info = (message as { info?: unknown }).info;
  if (!info || typeof info !== 'object') return null;
  const t = (info as { currentTime?: unknown }).currentTime;
  return typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : null;
}

/** The embed's address with the player's messages turned on (and `start` seconds in, when given). A class recording
 *  (BigBlueButton's playback) has no messages, but starts at `?t=`. */
export function withClock(src: string, origin: string, start?: number | null): string {
  try {
    const u = new URL(src);
    if (!u.hostname.includes('youtube')) {
      if (!start || start <= 0 || !u.pathname.startsWith('/playback/')) return src;
      u.searchParams.set('t', playbackTime(start));
      return u.toString();
    }
    u.searchParams.set('enablejsapi', '1');
    u.searchParams.set('origin', origin);
    if (start && start > 0) u.searchParams.set('start', String(Math.floor(start)));
    return u.toString();
  } catch {
    return src;
  }
}

/** The clock of the player in `frame` (null: no player on screen). */
export function useVideoClock(frame: RefObject<HTMLIFrameElement>, key: string | null): VideoClock {
  const [ready, setReady] = useState(false);
  const time = useRef<number | null>(null);

  const post = useCallback(
    (message: object) => {
      const win = frame.current?.contentWindow;
      if (win) win.postMessage(JSON.stringify({ ...message, id: 1, channel: 'widget' }), '*');
    },
    [frame],
  );

  useEffect(() => {
    setReady(false);
    time.current = null;
    if (!key) return undefined;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const t = timeFrom(e.origin, e.data);
      if (t === null) return;
      time.current = t;
      setReady(true);
    };
    window.addEventListener('message', onMessage);
    // say we're listening until the player answers (it may still be loading)
    let tries = 0;
    const hello = setInterval(() => {
      if (time.current !== null || tries++ > 40) clearInterval(hello);
      else post({ event: 'listening' });
    }, 500);
    return () => {
      clearInterval(hello);
      window.removeEventListener('message', onMessage);
    };
  }, [frame, key, post]);

  const now = useCallback(() => (time.current === null ? null : Math.floor(time.current)), []);
  const seek = useCallback(
    (seconds: number) => {
      post({ event: 'command', func: 'seekTo', args: [Math.max(0, seconds), true] });
      post({ event: 'command', func: 'playVideo', args: [] });
      time.current = seconds;
    },
    [post],
  );
  return { ready, now, seek };
}
