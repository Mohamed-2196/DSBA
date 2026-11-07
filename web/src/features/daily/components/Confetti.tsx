// A short burst of confetti when a game is won, as DSBA Daily celebrates: 36 pieces in BIBF's colours fly up and
// fall away in about a second and a half. Transform and opacity only, never in the way of a tap, and none at all
// with reduced motion (Confetti.css).
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './Confetti.css';

const COLOURS = ['#1d469e', '#f2b33d', '#1e7f4f', '#c7443d', '#0b6fb8', '#9ec1ff'];
const PIECES = 36;
const LASTS = 1700; // ms, the longest piece's flight and delay

/** Bursts each time `fire` goes up (0 draws nothing). */
export function Confetti({ fire }: { fire: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!fire) return;
    setShown(fire);
    const t = window.setTimeout(() => setShown(0), LASTS);
    return () => window.clearTimeout(t);
  }, [fire]);

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        // The same burst for the same `fire`, different from the last.
        const r = (n: number) => {
          const x = Math.sin((fire + 1) * 999 + i * 37 + n * 13) * 10000;
          return x - Math.floor(x);
        };
        return {
          '--x': `${(r(1) - 0.5) * 360}px`,
          '--y': `${-(160 + r(2) * 260)}px`,
          '--r': `${(r(3) - 0.5) * 720}deg`,
          animationDelay: `${Math.round(r(4) * 120)}ms`,
          width: `${6 + r(5) * 6}px`,
          height: `${8 + r(6) * 8}px`,
          background: COLOURS[i % COLOURS.length],
          borderRadius: r(7) > 0.6 ? '999px' : '2px',
        } as CSSProperties;
      }),
    [fire],
  );

  if (!shown) return null;
  return createPortal(
    <div key={shown} className="dy-confetti" aria-hidden="true">
      {pieces.map((style, i) => (
        <span key={i} className="dy-confetti__piece" style={style} />
      ))}
    </div>,
    document.body,
  );
}
