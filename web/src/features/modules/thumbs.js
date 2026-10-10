// YouTube thumbnail probe. Posters layer a thumbnail only when it really loads, and the player uses the
// same probe to tell whether YouTube is reachable at all from this network (campus networks and this
// sandbox block it): if no thumbnail has ever loaded and one failed, pressing play shows a clear
// "can't load here" state with "Open on YouTube" instead of an empty iframe.
import { useEffect, useState } from 'react';

const cache = new Map(); // src → 'ok' | 'missing' | 'error'
let anyOk = false;
let anyError = false;

/** 'none' (no thumbnail for this video) | 'pending' | 'ok' | 'missing' (YouTube's 120×90 placeholder) | 'error'. */
export function thumbStatus(src) {
  if (!src) return 'none';
  return cache.get(src) || 'pending';
}

/** True when YouTube looks unreachable: a thumbnail failed and none has loaded this session. */
export function youtubeLooksBlocked() {
  return anyError && !anyOk;
}

/** Probe a thumbnail once per session; re-renders when the result is known. */
export function useThumbnail(src) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!src || cache.has(src)) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const ok = img.naturalWidth > 120;
      cache.set(src, ok ? 'ok' : 'missing');
      anyOk = true;
      if (alive) setTick((n) => n + 1);
    };
    img.onerror = () => {
      cache.set(src, 'error');
      anyError = true;
      if (alive) setTick((n) => n + 1);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return thumbStatus(src);
}
