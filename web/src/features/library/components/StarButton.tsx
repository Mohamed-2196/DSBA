import { useEffect, useState, type MouseEvent } from 'react';
import { Icon, IconButton, cx, glyph } from '../../../ui';

/** Star toggle for a file. Presentational: pass `on` and `onToggle`. Pops when switched on. The star's colours
 *  are set on its own glyph (lib-star__glyph), not by restyling the IconButton (code quality review CQ-13). */
export function StarButton({
  on,
  onToggle,
  title,
  size = 'sm',
  className,
  tooltip = false,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  size?: 'sm' | 'md';
  className?: string;
  tooltip?: boolean;
}) {
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (!pop) return undefined;
    const t = setTimeout(() => setPop(false), 320);
    return () => clearTimeout(t);
  }, [pop]);
  return (
    <IconButton
      label={`Star ${title}`}
      icon={
        <Icon glyph={glyph.star} active={on} className={cx('lib-star__glyph', on && 'is-on', pop && 'is-popping')} />
      }
      size={size}
      aria-pressed={on}
      tooltip={tooltip}
      className={cx('lib-star', className)}
      onClick={(e: MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!on) setPop(true);
        onToggle();
      }}
    />
  );
}
