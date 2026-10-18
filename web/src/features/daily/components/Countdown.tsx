// The time left until the next set, ticking each second. When it runs out, `onDone` fetches the new set.
import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from '../lib/time';

export function Countdown({ to, onDone }: { to: string; onDone?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= new Date(to).getTime()) {
        window.clearInterval(id);
        done.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [to]);
  return (
    <time className="dy-num" dateTime={to}>
      {formatCountdown(to, now)}
    </time>
  );
}
