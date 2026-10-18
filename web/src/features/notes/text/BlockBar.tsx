// The toolbar over a selected picture or file. It sits inside the page, which is scaled for the zoom, and scales
// itself back so its buttons keep their size (44 px on a touch screen) at any zoom; over a picture near the edge of a
// narrow screen, it moves across to stay in view. Pressing it never takes the text's selection away, and it can be
// reached with Tab from the text. Its buttons, the In line / Free switch and the menu of less used choices are shared
// with the toolbar of a free picture (pictures/FreePictureLayer.tsx).
import { DotsThree, type Icon } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Menu, cx, type MenuItem } from '../../../ui';

/** Pixels the toolbar keeps from the sides of the view of the pages. */
const ROOM = 8;

export function BlockBar({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  // across, by as much as it takes to stay in the view of the pages (pixels)
  useLayoutEffect(() => {
    const el = ref.current;
    const view = el?.closest('.nb-scroller')?.getBoundingClientRect();
    if (!el || !view) return;
    const box = el.getBoundingClientRect();
    const left = box.left - shift;
    const right = box.right - shift;
    let next = 0;
    if (right - left > view.width - 2 * ROOM) next = view.left + (view.width - (right - left)) / 2 - left;
    else if (left < view.left + ROOM) next = view.left + ROOM - left;
    else if (right > view.right - ROOM) next = view.right - ROOM - right;
    if (Math.abs(next - shift) > 0.5) setShift(next);
  }, [shift, label, children]);
  return (
    <div
      ref={ref}
      className="nb-blockbar"
      style={{ '--bar-shift': `${shift}px` } as CSSProperties}
      role="toolbar"
      aria-label={label}
      contentEditable={false}
      // the page's own gestures (selecting, moving the picture) don't start from the toolbar
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLElement && e.target.closest('a'))) e.preventDefault();
      }}
      onKeyDown={(e) => {
        // Escape goes back to the text, with the picture or file still selected
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.closest<HTMLElement>('.ProseMirror')?.focus();
      }}
    >
      {children}
    </div>
  );
}

interface BlockBarButtonProps {
  icon: Icon;
  label: string;
  /** show the label beside the icon */
  text?: boolean;
  onClick?: () => void;
  /** a link that opens in a new tab instead */
  href?: string;
  pressed?: boolean;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export function BlockBarButton({
  icon: I,
  label,
  text = false,
  onClick,
  href,
  pressed,
  primary,
  danger,
  disabled,
}: BlockBarButtonProps) {
  const className = cx(
    'nb-blockbar__button',
    text && 'has-text',
    pressed && 'is-active',
    primary && 'is-primary',
    danger && 'is-danger',
  );
  if (href) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
        <I aria-hidden="true" />
        {text ? <span>{label}</span> : null}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={text ? undefined : label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <I aria-hidden="true" weight={pressed ? 'fill' : 'regular'} />
      {text ? <span>{label}</span> : null}
    </button>
  );
}

/** Whether a picture is in line with the text or free on the page: one control that shows which, and switches it. */
export function PlacementSwitch({
  free,
  onInline,
  onFree,
  inlineOff,
}: {
  free: boolean;
  onInline?: () => void;
  onFree?: () => void;
  /** why it can't go in line (the note has no paper to type on) */
  inlineOff?: string;
}) {
  return (
    <div className="nb-placement" role="radiogroup" aria-label="Placement" data-hub="picture-placement">
      <button
        type="button"
        role="radio"
        aria-checked={!free}
        className={cx('nb-placement__item', !free && 'is-active')}
        title={inlineOff ?? 'In line: it moves with the text'}
        disabled={free && !!inlineOff}
        onClick={free ? onInline : undefined}
      >
        In line
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={free}
        className={cx('nb-placement__item', free && 'is-active')}
        title="Free: put it anywhere on the page, over or beside the writing"
        onClick={free ? undefined : onFree}
      >
        Free
      </button>
    </div>
  );
}

/** The bar's less used choices, behind one button. */
export function BarMenu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <Menu
      align="end"
      label={label}
      items={items}
      trigger={
        <button type="button" className="nb-blockbar__button" aria-label={label} title={label}>
          <DotsThree aria-hidden="true" weight="bold" />
        </button>
      }
    />
  );
}
