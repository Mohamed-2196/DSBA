import { useEffect, useState } from 'react';
import { cx } from '../../../ui';

interface Roll {
  value: number;
  prev: number | null;
  dir: 'up' | 'down';
  key: number;
}

/**
 * A number that rolls like an odometer when it changes (up: the new value slides in from below).
 * Used for vote and reply counts so a change is visible at a glance.
 * The old value is dropped when the roll animation ends (fallback timer if animations are off).
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const [roll, setRoll] = useState<Roll>({ value, prev: null, dir: 'up', key: 0 });
  if (roll.value !== value) {
    // Derive the animation from the previous render's value (React's "adjust state on prop change").
    setRoll({ value, prev: roll.value, dir: value > roll.value ? 'up' : 'down', key: roll.key + 1 });
  }
  const rolling = roll.prev !== null;
  const settle = () => setRoll((r) => (r.key === roll.key && r.prev !== null ? { ...r, prev: null } : r));

  useEffect(() => {
    if (!rolling) return undefined;
    const t = setTimeout(() => setRoll((r) => (r.key === roll.key ? { ...r, prev: null } : r)), 1200);
    return () => clearTimeout(t);
  }, [rolling, roll.key]);

  return (
    <span className={cx('forum-roll', rolling && 'is-rolling', className)} data-dir={roll.dir}>
      {rolling ? (
        <span key={`old-${roll.key}`} className="forum-roll__old" aria-hidden="true">
          {roll.prev}
        </span>
      ) : null}
      <span key={`new-${roll.key}`} className="forum-roll__new" onAnimationEnd={rolling ? settle : undefined}>
        {value}
      </span>
    </span>
  );
}
