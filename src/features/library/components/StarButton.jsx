import { useEffect, useState } from 'react';
import { Star } from '@phosphor-icons/react';
import { IconButton, cx } from '../../../ui';

/** Star toggle for a file. Presentational: pass `on` and `onToggle`. Pops when switched on. */
export function StarButton({ on, onToggle, title, size = 'sm', variant = 'ghost', className, tooltip = false, ...rest }) {
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (!pop) return undefined;
    const t = setTimeout(() => setPop(false), 320);
    return () => clearTimeout(t);
  }, [pop]);
  return (
    <IconButton
      label={`Star ${title}`}
      icon={<Star weight={on ? 'fill' : 'regular'} />}
      size={size}
      variant={variant}
      toggle
      active={on}
      tooltip={tooltip}
      className={cx('lib-star', on && 'is-on', pop && 'is-popping', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!on) setPop(true);
        onToggle?.();
      }}
      {...rest}
    />
  );
}
