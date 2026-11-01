// The acknowledgement the Hub carries, in plain words and quietly, where credits belong: the sidebar's foot, More on a
// phone, the footer and About.
import { cx } from '../../ui';

export const POWERED_BY = 'Powered by BIBF Innovation Hub';

export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={cx('site-powered', className)} data-hub="powered-by">
      {POWERED_BY}
    </p>
  );
}
