// The toolbar over a selected picture or file. It sits inside the page, which is scaled for the zoom, and scales
// itself back so its buttons keep their size (44 px on a touch screen) at any zoom. Pressing it never takes the text's
// selection away, and it can be reached with Tab from the text.
import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cx } from '../../../ui';

export function BlockBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="nb-blockbar"
      role="toolbar"
      aria-label={label}
      contentEditable={false}
      // the page's own gestures (selecting, moving the picture) don't start from the toolbar
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLElement && e.target.closest('a'))) e.preventDefault();
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

export function BlockBarButton({ icon: I, label, text = false, onClick, href, pressed, primary, danger, disabled }: BlockBarButtonProps) {
  const className = cx('nb-blockbar__button', text && 'has-text', pressed && 'is-active', primary && 'is-primary', danger && 'is-danger');
  if (href) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
        <I aria-hidden="true" />
        {text ? <span>{label}</span> : null}
      </a>
    );
  }
  return (
    <button type="button" className={className} aria-label={text ? undefined : label} aria-pressed={pressed} title={label} onClick={onClick} disabled={disabled}>
      <I aria-hidden="true" weight={pressed ? 'fill' : 'regular'} />
      {text ? <span>{label}</span> : null}
    </button>
  );
}
