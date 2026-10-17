// A short message over the top of the board ("Not in the word list", "One away"): where the eyes already are,
// read out by screen readers, gone after a moment.
import { cx } from '../../../ui';

export type FlashTone = 'info' | 'alert' | 'good';

export interface FlashMessage {
  id: number;
  text: string;
  tone: FlashTone;
}

export function Flash({ message }: { message: FlashMessage | null }) {
  return (
    <div className="dg-flash" role="status" aria-live="polite" aria-atomic="true">
      {message ? (
        <span key={message.id} className={cx('dg-flash__text', `dg-flash__text--${message.tone}`)}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
