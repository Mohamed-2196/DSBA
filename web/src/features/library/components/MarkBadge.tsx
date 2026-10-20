// A practised question's mark, beside it in lists: a tick for done, a flag for stuck, an arrow for skipped.
import { Icon, cx, glyph } from '../../../ui';
import { MARK_LABEL, type Mark } from '../practice';
import './MarkBadge.css';

const GLYPH = { done: glyph.check, stuck: glyph.flag, skipped: glyph.forward } as const;

export function MarkBadge({ mark, className }: { mark: Mark; className?: string }) {
  return (
    <span className={cx('lib-mark', `lib-mark--${mark}`, className)} data-hub="question-mark">
      <Icon glyph={GLYPH[mark]} aria-hidden="true" />
      <span>{MARK_LABEL[mark]}</span>
    </span>
  );
}
