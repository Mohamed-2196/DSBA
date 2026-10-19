import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../internal';
import { loadedDeskmate, preloadDeskmate } from './load';
import { MATE_MIN_SIZE, mateLabel, motionTimings } from './mates';
import type { MateName, MatePose } from './types';
import './Deskmate.css';

export type DeskmateProps<M extends MateName> = {
  mate: M;
  /** default idle */
  state?: MatePose<M>;
  /** in px: 98-104 in a section header, 160 in an empty state, 40 in a toast. Below 32 nothing is drawn. */
  size?: number;
  /**
   * Decorative by default (beside a heading that names the section). Pass true for the deskmate's own alt text, or
   * a string, when it carries meaning alone.
   */
  label?: boolean | string;
  /** a colour for the main body (Binder's cover takes the module's colour) */
  cover?: string;
  /** Blink's countdown: the number on the card (beside Blink below 48 px) */
  count?: ReactNode;
  className?: string;
};

/**
 * A deskmate: a study object come to life (docs/design/deskmates). It marks where you are (idle, in a section header),
 * shows that a list is empty (sleepy) and that something worked (happy). Its halo shows only on dark grounds. It
 * blinks now and then and hops when happy, only while it is on screen and only when motion is welcome.
 */
export function Deskmate<M extends MateName>({
  mate,
  state,
  size = 96,
  label = false,
  cover,
  count,
  className,
}: DeskmateProps<M>) {
  const pose: MatePose = state ?? 'idle';
  const art = loadedDeskmate(mate);
  const [, setLoads] = useState(0);
  const [timing] = useState(motionTimings);
  const [live, setLive] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (art) return undefined;
    let on = true;
    preloadDeskmate(mate).then(
      () => on && setLoads((n) => n + 1),
      () => undefined, // a chunk that didn't load leaves the space empty; the deskmate is never the only content
    );
    return () => {
      on = false;
    };
  }, [mate, art]);

  // Loops run only while the deskmate is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setLive(Boolean(entry?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (size < MATE_MIN_SIZE) return null;
  const name = typeof label === 'string' ? label : label ? mateLabel(mate, pose) : null;
  const drawing = art?.[pose];
  const beside = count != null && size < 48;
  const style = {
    // a container may set --mate-size per breakpoint; the size prop is the fallback
    '--mate-px': `${size}px`,
    '--mate-blink-every': `${timing.every}s`,
    '--mate-blink-delay': `${timing.delay}s`,
    // the hop is 6 screen px, drawn in the 200-unit box
    '--mate-hop': `${-1200 / size}px`,
    ...(cover ? { '--mate-cover': cover } : {}),
  } as CSSProperties;

  return (
    <span
      ref={ref}
      className={cx('ui-mate', `ui-mate--${pose}`, cover && 'ui-mate--cover', beside && 'ui-mate--beside', className)}
      data-live={live || undefined}
      style={style}
    >
      <svg
        key={pose}
        viewBox="0 0 200 200"
        className="ui-mate__art"
        {...(name ? { role: 'img', 'aria-label': name } : { 'aria-hidden': true, focusable: false })}
      >
        {drawing}
      </svg>
      {count != null ? <span className="ui-mate__count">{count}</span> : null}
    </span>
  );
}
