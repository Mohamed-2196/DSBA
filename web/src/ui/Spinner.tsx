import { cx } from './internal';
import './Spinner.css';

export interface SpinnerProps {
  /** diameter in px; default 18 */
  size?: number;
  className?: string;
}

/** A plain ring that turns while something loads. Decorative: say what is loading next to it (role="status"). */
export function Spinner({ size = 18, className }: SpinnerProps) {
  return <span className={cx('ui-spinner', className)} style={{ width: size, height: size }} aria-hidden="true" />;
}
