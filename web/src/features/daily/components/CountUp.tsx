// A number that counts up to its value, as DSBA Daily's stats do: from the last value shown (0 at first) over about
// half a second. Text only, so nothing moves around it; with reduced motion it simply shows the value.
import { useEffect, useRef, useState } from 'react';

const TAKES = 600; // ms

export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / TAKES);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown}</>;
}
